const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json());

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Telegram Bot Setup
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'https://skyway-travel.onrender.com';
const bot = new Telegraf(BOT_TOKEN);

// 🌐 የአድሚን ዳሽቦርድ ዌብ ገጽ (በቀጥታ ከሰርቨሩ የሚሰራ - ፋይል አያስፈልገውም)
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="am">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sky Way - Admin Dashboard</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f6; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 900px; margin: auto; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        h2 { color: #0f2b48; text-align: center; margin-bottom: 25px; }
        .search-box { width: 100%; padding: 12px; font-size: 16px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px; box-sizing: border-box; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { background-color: #0f2b48; color: white; }
        .status-waiting { color: #d97706; font-weight: bold; }
        .status-approved { color: #16a34a; font-weight: bold; }
        .action-btn { background: #0f2b48; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; }
        .action-btn:hover { background: #1b3b6f; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
        .modal-content { background: white; padding: 25px; border-radius: 10px; width: 350px; text-align: center; }
        .modal-content input { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; }
        .modal-content button { padding: 10px 20px; background: #16a34a; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .close-btn { background: #dc2626; margin-left: 10px; }
        #msg { margin-top: 10px; font-weight: bold; font-size: 13px; }
    </style>
</head>
<body>

<div class="container">
    <h2>✈️ Sky Way Travel Agency - Admin Dashboard</h2>
    <input type="text" id="searchInput" class="search-box" placeholder="🔍 በተጓዥ ስም ይፈልጉ..." onkeyup="filterOrders()">
    <div style="overflow-x:auto;">
        <table>
            <thead>
                <tr>
                    <th>ተጓዥ ስም</th>
                    <th>መስመር / Stopover</th>
                    <th>ቀን</th>
                    <th>ሁኔታ (Status)</th>
                    <th>እርምጃ</th>
                </tr>
            </thead>
            <tbody id="ordersBody">
                <tr><td colspan="5" style="text-align:center;">መረጃዎች በመጫን ላይ...</td></tr>
            </tbody>
        </table>
    </div>
</div>

<div id="approvalModal" class="modal">
    <div class="modal-content">
        <h3>የፓኬጅ ዋጋ ማጽደቂያ</h3>
        <p id="modalPassenger" style="font-weight: bold; color: #555;"></p>
        <input type="hidden" id="activeQuoteId">
        <label>የመሸጫ ዋጋ (በ ETB)፦</label>
        <input type="number" id="sellingPriceETB" placeholder="ምሳሌ፦ 145000">
        <div>
            <button onclick="submitApproval()">አጽድቅ</button>
            <button class="close-btn" onclick="closeModal()">ዝጋ</button>
        </div>
        <div id="msg"></div>
    </div>
</div>

<script>
let allOrders = [];

async function fetchOrders() {
    try {
        const res = await fetch('/api/admin/orders');
        const data = await res.json();
        if(data.success) {
            allOrders = data.orders;
            displayOrders(allOrders);
        }
    } catch (err) {
        console.error('Error fetching orders:', err);
    }
}

function displayOrders(orders) {
    const tbody = document.getElementById('ordersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="5" style="text-align:center;">ምንም ትዕዛዝ አልተገኘም</td></tr>\`;
        return;
    }
    orders.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
            <td>\${o.passenger_name}</td>
            <td>\${o.origin} ➔ \${o.destination} (\${o.stopover_city})</td>
            <td>\${o.ethiopian_date}</td>
            <td><span class="\${o.status === 'APPROVED' ? 'status-approved' : 'status-waiting'}">\${o.status}</span></td>
            <td><button class="action-btn" onclick="openModal('\${o.id}', '\che\${o.passenger_name}')">አስተዳድር</button></td>
        \`;
        tbody.appendChild(tr);
    });
}

function filterOrders() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allOrders.filter(o => o.passenger_name.toLowerCase().includes(query));
    displayOrders(filtered);
}

function openModal(id, name) {
    document.getElementById('activeQuoteId').value = id;
    document.getElementById('modalPassenger').innerText = \`ተጓዥ: \${name}\`;
    document.getElementById('sellingPriceETB').value = '';
    document.getElementById('msg').innerText = '';
    document.getElementById('approvalModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('approvalModal').style.display = 'none';
    fetchOrders();
}

async function submitApproval() {
    const quoteId = document.getElementById('activeQuoteId').value;
    const price = document.getElementById('sellingPriceETB').value;
    const msgDiv = document.getElementById('msg');
    if(!price) {
        msgDiv.style.color = "red";
        msgDiv.innerText = "እባክዎን ዋጋ ያስገቡ!";
        return;
    }
    const res = await fetch('/api/admin/approve-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, finalSellingPriceETB: parseFloat(price) })
    });
    const data = await res.json();
    msgDiv.style.color = data.success ? "green" : "red";
    msgDiv.innerText = data.message;
    if(data.success) {
        setTimeout(closeModal, 1500);
    }
}

fetchOrders();
</script>
</body>
</html>
  `);
});

// Multi-City & Stopover Engine
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

// 1. የጉዞ ጥያቄ መቀበያ API
app.post('/api/search-multi-city', async (req, res) => {
  try {
    const { passengerName, travelDate, stopoverDays } = req.body;
    const days = stopoverDays || 3;
    const travelPackage = mockMultiCityStopoverSearch(days);

    const { data: quote, error } = await supabase.from('flight_quotes').insert([{
      passenger_name: passengerName,
      ethiopian_date: travelDate,
      gregorian_date: travelDate,
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

    if (ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `🚨 **አዲስ የንግድ ጉዞ ጥያቄ መጥቷል!**\n\n` +
        `👤 **ተጓዥ:** ${passengerName}\n` +
        `📍 **መስመር:** ADD ➔ CAN (Stopover: DXB - ${days} ቀናት)\n` +
        `📅 **ቀን:** ${travelDate}\n` +
        `💵 **አጠቃላይ ጅምላ ወጪ:** $${travelPackage.net_flight_fare_usdt + travelPackage.net_hotel_usdt + travelPackage.net_visa_usdt} USDT`,
        Markup.inlineKeyboard([[Markup.button.url('⚙️ በዳሽቦርድ አጽድቅ', `${BACKEND_URL}/?quoteId=${quote[0].id}`)]])
      );
    }

    res.json({ success: true, message: 'ፓኬጅዎ ተዘጋጅቷል፤ ለአድሚን ማረጋገጫ ተልኳል።', quoteId: quote[0].id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. ሁሉንም ኦርደሮች ለማምጣት API (ለአድሚን ዳሽቦርድ)
app.get('/api/admin/orders', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('flight_quotes')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json({ success: true, orders: data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. የኪሳራ መከላከያ እና የአድሚን ማረጋገጫ API
app.post('/api/admin/approve-package', async (req, res) => {
  try {
    const { quoteId, finalSellingPriceETB } = req.body;
    const { data: quote } = await supabase.from('flight_quotes').select('*').eq('id', quoteId).single();
    const { data: settings } = await supabase.from('system_settings').select('*').single();
    const rate = settings ? settings.usdt_to_etb_rate : 120;

    const totalNetUSDT = quote.net_fare_1to2_usdt + quote.hotel_net_usdt + quote.visa_net_usdt;
    const minimumCostETB = totalNetUSDT * rate;

    if (finalSellingPriceETB < minimumCostETB) {
      return res.status(400).json({ 
        success: false, 
        message: `⚠️ ክልከላ፡ ዝቅተኛው ወጪ ${minimumCostETB.toLocaleString()} ETB ነው። ከዚህ በታች መሸጥ ያስከስርዎታል!` 
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

bot.launch();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sky Way Full System running on port ${PORT}`));
