const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'YOUR_ADMIN_CHAT_ID'; // የእርስዎ የቴሌግራም ID
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const bot = new Telegraf(BOT_TOKEN);

// 1. የ/start ትእዛዝ ለደንበኞች
bot.start((ctx) => {
  ctx.reply(
    `ሰላም ${ctx.from.first_name}👋 Welcome to Sky Way Travel Agency!\n\nለነጋዴዎች የተዘጋጀ የትኬት፣ የሆቴል እና የቪዛ አገልግሎት።`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✈️ የትራንዚት/የንግድ ጉዞ መፈለጊያ', 'SEARCH_FLIGHT')],
      [Markup.button.callback('📞 ከኤጀንሲው ጋር ለመነጋገር', 'CONTACT_US')]
    ])
  );
});

// 2. የጉዞ ጥያቄ መቀበያ
bot.action('SEARCH_FLIGHT', (ctx) => {
  ctx.reply(
    'እባክዎን የጉዞዎን መረጃ በሚከተለው መልኩ ይላኩልን፦\n\n' +
    'ምሳሌ፦\n' +
    'ስም፡ አቶ ከበደ\n' +
    'መነሻ፡ አዲስ አበባ (ADD)\n' +
    'መድረሻ፡ ጓንግዙ (CAN)\n' +
    'የቆይታ ቦታ፡ ዱባይ (DXB) 3 ቀናት\n' +
    'ቀን፡ 15/02/2017'
  );
});

// 3. ለአድሚን ማስታወቂያ መላኪያ ፈንክሽን
async function notifyAdminNewQuote(quoteData) {
  const message = 
    `🚨 **አዲስ የንግድ ጉዞ ጥያቄ መጥቷል!**\n\n` +
    `👤 **ተጓዥ:** ${quoteData.passenger_name}\n` +
    `📍 **መስመር:** ${quoteData.origin} ➔ ${quoteData.destination}\n` +
    `🏨 **Stopover:** ${quoteData.stopover_city} (${quoteData.stopover_days} ቀናት)\n` +
    `📅 **የኢትዮጵያ ቀን:** ${quoteData.ethiopian_date}\n` +
    `🧳 **ሻንጣ:** ሲሄድ 1 / ሲመለስ 2 ሻንጣዎች\n` +
    `📄 **ቪዛ & ሆቴል:** ተካቷል\n\n` +
    `💵 **የ B2B ጅምላ ወጪ (Net):** $${quoteData.net_fare_1to2_usdt + quoteData.hotel_net_usdt + quoteData.visa_net_usdt} USDT\n\n` +
    `እባክዎን ዋጋውን አጽድቀው ለደንበኛው ይላኩ።`;

  await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, 
    Markup.inlineKeyboard([
      [Markup.button.url('⚙️ በዳሽቦርድ አጽድቅ (Approve)', `${BACKEND_URL}/admin?quoteId=${quoteData.id}`)]
    ])
  );
}

bot.launch();
console.log('Sky Way Telegram Bot started...');
