const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Telegram Bot Setup
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'https://your-render-app.onrender.com';
const bot = new Telegraf(BOT_TOKEN);

// Multi-City & Stopover Engine (አዲስ አበባ - ጓንግዙ - ዱባይ 3 ቀናት - አዲስ አበባ)
function mockMultiCityStopoverSearch(stopoverDays) {
  return {
    airline: 'Emirates / Ethiopian Airlines Partner',
    routeType: 'MULTI_CITY_STOPOVER',
    legs: [
      { from: 'ADD', to: 'CAN', baggage: '1 Bag (23kg)' },
      { from: 'CAN', to: 'DXB', stopover: `${stopoverDays} Days Stay` },
      { from: 'DXB', to: 'ADD', baggage: '2 Bags (46kg - Commercial)' }
    ],
    net_flight_fare_usdt: 950,
    net_hotel_usdt: stopoverDays * 50,
    net_visa_usdt: 90
  };
}

// API Endpoint: የጉዞ ጥያቄ መቀበያ
app.post('/api/search-multi-city', async (req, res) => {
  try {
    const { passengerName, travelDate, stopoverDays } = req.body;
    const days = stopoverDays || 3;
    const travelPackage = mockMultiCityStopoverSearch(days);

    const { data: quote, error } = await supabase.from('flight_quotes').insert([{
      passenger_name: passengerName,
      ethiopian_date: travelDate,
      gregorian_date: travelDate, // በቀጥታ በሰንጠረዥ እንዲቀመጥ
      route_type: 'MULTI_CITY_STOPOVER',
      origin: 'ADD',
      destination: 'CAN',
      stopover_city: 'DXB',
      stopover_days: days,
      include_visa: true,
      include_hotel: true,
      net_fare_1to1_usdt: travelPackage.net_flight_fare_usdt,
      net_fare_1to2_usdt: travelPackage.net_flight_fare_usdt + 80,
      hotel_net_usdt: travelPackage.net_hotel_usdt,
      visa_net_usdt: travelPackage.net_visa_usdt,
      status: 'WAITING_ADMIN_APPROVAL'
    }]).select();

    if (error) throw error;

    // ለአድሚን በቴሌግራም ማሳወቂያ መላክ
    if (ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `🚨 **አዲስ የንግድ ጉዞ ጥያቄ መጥቷል!**\n\n` +
        `👤 **ተጓዥ:** ${passengerName}\n` +
        `📍 **መስመር:** ADD ➔ CAN (Stopover: DXB - ${days} ቀናት)\n` +
        `📅 **ቀን:** ${travelDate}\n` +
        `💵 **አጠቃላይ ጅምላ ወጪ:** $${travelPackage.net_flight_fare_usdt + travelPackage.net_hotel_usdt + travelPackage.net_visa_usdt} USDT`,
        Markup.inlineKeyboard([[Markup.button.url('⚙️ በዳሽቦርድ አጽድቅ', `${BACKEND_URL}/admin.html?quoteId=${quote[0].id}`)]])
      );
    }

    res.json({ success: true, message: 'ፓኬጅዎ ተዘጋጅቷል፤ ለአድሚን ማረጋገጫ ተልኳል።', quoteId: quote[0].id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Endpoint: የኪሳራ መከላከያ እና የአድሚን ማረጋገጫ
app.post('/api/admin/approve-package', async (req, res) => {
  try {
    const { quoteId, finalSellingPriceETB } = req.body;
    const { data: quote } = await supabase.from('flight_quotes').select('*').eq('id', quoteId).single();
    const { data: settings } = await supabase.from('system_settings').select('*').single();
    const rate = settings ? settings.usdt_to_etb_rate : 120;

    const totalNetUSDT = quote.net_fare_1to2_usdt + quote.hotel_net_usdt + quote.visa_net_usdt;
    const minimumCostETB = totalNetUSDT * rate;

    // 🛑 የኪሳራ መከላከያ (Loss Guardrail)
    if (finalSellingPriceETB < minimumCostETB) {
      return res.status(400).json({ 
        success: false, 
        message: `⚠️ ክልከላ፡ የዚህ ፓኬጅ ዝቅተኛው ወጪ ${minimumCostETB.toLocaleString()} ETB ነው። ከዚህ በታች መሸጥ ያስከስርዎታል!` 
      });
    }

    const { data: updatedQuote } = await supabase.from('flight_quotes').update({
      approved_price_1to2_etb: finalSellingPriceETB,
      status: 'APPROVED'
    }).eq('id', quoteId).select();

    res.json({ success: true, message: '✅ ፓኬጁ ከኪሳራ ነፃ ሆኖ ጸድቋል!', quote: updatedQuote[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Telegram Bot Start Command
bot.start((ctx) => {
  ctx.reply(`ሰላም ${ctx.from.first_name}👋 Welcome to Sky Way Travel Agency!\n\nለነጋዴዎች የተዘጋጀ የትኬት፣ የሆቴል እና የቪዛ አገልግሎት።`,
    Markup.inlineKeyboard([[Markup.button.callback('✈️ የጉዞ ማሳሰቢያ', 'INFO')]])
  );
});

bot.action('INFO', (ctx) => {
  ctx.reply('እባክዎን የጉዞ ጥያቄዎን በሲስተሙ በኩል ያስገቡ።');
});

bot.launch();

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sky Way Full System running on port ${PORT}`));
