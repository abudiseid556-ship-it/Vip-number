require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Telegram Bot Setup
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ቀለል ያለ የቀን ማስተካከያ (ያለ ውጭ ፓኬጅ ድጋፍ)
function convertEthToGregorian(ethYear, ethMonth, ethDay) {
    // ለጊዜው ግሪጎሪያንቀን እንደ ግብዓቱ ቅርጸት እንዲቀጥል የሚያደርግ
    return `${ethYear}-${String(ethMonth).padStart(2, '0')}-${String(ethDay).padStart(2, '0')}`;
}

// Multi-City & Stopover Engine
function mockMultiCityStopoverSearch(stopoverDays) {
    return {
        airline: 'Emirates / Ethiopian Airlines Partner',
        net_flight_fare_usdt: 950,
        net_hotel_usdt: (stopoverDays || 3) * 50,
        net_visa_usdt: 90
    };
}

// ================= TELEGRAM BOT LOGIC =================
bot.start((ctx) => {
  ctx.reply(
    `ሰላም ${ctx.from.first_name}👋 Welcome to Sky Way Travel Agency!\n\nለነጋዴዎች የተዘጋጀ የትኬት፣ የሆቴል እና የቪዛ ፓኬጅ።`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✈️ Multi-City / Stopover ጥያቄ', 'SEARCH_FLIGHT')]
    ])
  );
});

bot.action('SEARCH_FLIGHT', (ctx) => {
  ctx.reply(
    'እባክዎን የጉዞዎን መረጃ በሚከተለው መልኩ ይላኩልን፦\n\n' +
    'ምሳሌ፡\n' +
    'ስም፡ አቶ ከበደ\n' +
    'መስመር፡ አዲስ አበባ - ጓንግዙ - ዱባይ (3 ቀናት)\n' +
    'ቀን፡ 15/02/2017'
  );
});

// ቦቱን ማስጀመር
bot.launch().then(() => console.log('Telegram Bot started successfully'));

// ================= EXPRESS API ENDPOINTS =================

// 1. የጥያቄ ማግኛ ኤንድፖይንት
app.post('/api/search-multi-city', async (req, res) => {
    try {
        const { passengerName, ethYear, ethMonth, ethDay, stopoverDays } = req.body;
        const gregorianDateStr = convertEthToGregorian(ethYear, ethMonth, ethDay);
        const travelPackage = mockMultiCityStopoverSearch(stopoverDays);

        const { data: quote, error } = await supabase.from('flight_quotes').insert([{
            passenger_name: passengerName,
            ethiopian_date: `${ethYear}-${ethMonth}-${ethDay}`,
            gregorian_date: gregorianDateStr,
            origin: 'ADD',
            destination: 'CAN',
            stopover_city: 'DXB',
            stopover_days: stopoverDays || 3,
            net_fare_1to1_usdt: travelPackage.net_flight_fare_usdt,
            net_fare_1to2_usdt: travelPackage.net_flight_fare_usdt + 80,
            hotel_net_usdt: travelPackage.net_hotel_usdt,
            visa_net_usdt: travelPackage.net_visa_usdt,
            status: 'WAITING_ADMIN_APPROVAL'
        }]).select();

        if (error) throw error;
        res.json({ success: true, quoteId: quote[0].id, packageDetails: travelPackage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. የኪሳራ መከላከያ እና የአድሚን ማረጋገጫ (Loss Prevention Guardrail)
app.post('/api/admin/approve-package', async (req, res) => {
    try {
        const { quoteId, finalSellingPriceETB } = req.body;
        const { data: quote } = await supabase.from('flight_quotes').select('*').eq('id', quoteId).single();
        const { data: settings } = await supabase.from('system_settings').select('*').single();

        const rate = settings.usdt_to_etb_rate;
        const totalNetUSDT = quote.net_fare_1to2_usdt + quote.hotel_net_usdt + quote.visa_net_usdt;
        const minimumCostETB = totalNetUSDT * rate;

        // 🛑 የኪሳራ መከላከያ ፍተሻ
        if (finalSellingPriceETB < minimumCostETB) {
            return res.status(400).json({
                success: false,
                message: `⚠️ ክልከላ፡ የዚህ ፓኬጅ አጠቃላይ ወጪ ${minimumCostETB.toLocaleString()} ETB ነው። ከዚህ ያነሰ ዋጋ መሸጥ ያከሰስዎታል!`
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sky Way Unified System Running on Port ${PORT}`));
