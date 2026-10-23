const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const ethiopianDate = require('ethiopian-date');

const app = express();
app.use(express.json());

// Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. የኢትዮጵያ ቀንን ወደ አውሮፓውያን ቀን መቀየሪያ
function convertEthToGregorian(ethYear, ethMonth, ethDay) {
    const gDate = ethiopianDate.toGregorian(parseInt(ethYear), parseInt(ethMonth), parseInt(ethDay));
    return `${gDate[0]}-${String(gDate[1]).padStart(2, '0')}-${String(gDate[2]).padStart(2, '0')}`;
}

// =================================================================
// 2. MULTI-CITY & STOPOVER ENGINE (አዲስ አበባ - ጓንግዙ - ዱባይ 3 ቀናት - አዲስ አበባ)
// =================================================================
function mockMultiCityStopoverSearch(stopoverDays) {
    return {
        airline: 'Emirates / Ethiopian Airlines Partner',
        routeType: 'MULTI_CITY_STOPOVER',
        legs: [
            { from: 'ADD', to: 'CAN', baggage: '1 Bag (23kg)' },
            { from: 'CAN', to: 'DXB', stopover: `${stopoverDays} Days Stay` },
            { from: 'DXB', to: 'ADD', baggage: '2 Bags (46kg - Commercial)' }
        ],
        net_flight_fare_usdt: 950,   // የቲኬት ጅምላ ወጪ
        net_hotel_usdt: stopoverDays * 50, // ለ 3 ቀናት ሆቴል ($50 በየቀኑ)
        net_visa_usdt: 90            // የ UAE ዱባይ ትራንዚት/ቱሪስት ቪዛ
    };
}

// =================================================================
// 3. የፍለጋ ጥያቄ መቀበያ ኤንድፖይንት (Stopover & Multi-City Request)
// =================================================================
app.post('/api/search-multi-city', async (req, res) => {
    try {
        const { 
            passengerName, ethYear, ethMonth, ethDay, stopoverDays 
        } = req.body;

        // የቀን ዝውውር
        const gregorianDateStr = convertEthToGregorian(ethYear, ethMonth, ethDay);

        // የጉዞ ፓኬጅ ፍለጋ (ማቆያ 3 ቀናት ነጋዴዎችን መሰረት ያደረገ)
        const travelPackage = mockMultiCityStopoverSearch(stopoverDays || 3);

        // በዳታቤዝ ውስጥ ለታማኝ አስተዳደር መመዝገብ
        const { data: quote, error } = await supabase.from('flight_quotes').insert([{
            passenger_name: passengerName,
            ethiopian_date: `${ethYear}-${ethMonth}-${ethDay}`,
            gregorian_date: gregorianDateStr,
            route_type: 'MULTI_CITY_STOPOVER',
            origin: 'ADD',
            destination: 'CAN',
            stopover_city: 'DXB',
            stopover_days: stopoverDays || 3,
            include_visa: true,
            include_hotel: true,
            net_fare_1to1_usdt: travelPackage.net_flight_fare_usdt,
            net_fare_1to2_usdt: travelPackage.net_flight_fare_usdt + 80, // ለ 2 ሻንጣ ተጨማሪ
            hotel_net_usdt: travelPackage.net_hotel_usdt,
            visa_net_usdt: travelPackage.net_visa_usdt,
            status: 'WAITING_ADMIN_APPROVAL'
        }]).select();

        if (error) throw error;

        res.json({
            success: true,
            message: 'የንግድ ጉዞ ፓኬጅዎ (ቲኬት + 3 ቀናት ዱባይ ሆቴል + ቪዛ) ተዘጋጅቷል፤ ለአድሚን ማረጋገጫ ተልኳል።',
            quoteId: quote[0].id,
            packageDetails: travelPackage
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 4. የኪሳራ መከላከያ እና የአድሚን ማረጋገጫ (Loss Prevention & Approval)
// =================================================================
app.post('/api/admin/approve-package', async (req, res) => {
    try {
        const { quoteId, finalSellingPriceETB } = req.body;

        // 1. መረጃዎችን ማምጣት
        const { data: quote } = await supabase.from('flight_quotes').select('*').eq('id', quoteId).single();
        const { data: settings } = await supabase.from('system_settings').select('*').single();

        const rate = settings.usdt_to_etb_rate;

        // 2. አጠቃላይ የ B2B ጅምላ ወጪ (ቲኬት + ሆቴል + ቪዛ) በብር
        const totalNetUSDT = quote.net_fare_1to2_usdt + quote.hotel_net_usdt + quote.visa_net_usdt;
        const minimumCostETB = totalNetUSDT * rate;

        // 3. 🛑 የኪሳራ መከላከያ (LOSS PREVENTION GUARDRAIL)
        if (finalSellingPriceETB < minimumCostETB) {
            return res.status(400).json({
                success: false,
                error_type: 'LOSS_PREVENTION_TRIGGERED',
                message: `⚠️ ክልከላ፡ የዚህ ፓኬጅ አጠቃላይ ወጪ ${minimumCostETB.toLocaleString()} ETB ነው። ከዚህ በታች መሸጥ ያስከስርዎታል!`
            });
        }

        // 4. ማጽደቅ
        const { data: updatedQuote } = await supabase.from('flight_quotes').update({
            approved_price_1to2_etb: finalSellingPriceETB,
            status: 'APPROVED'
        }).eq('id', quoteId).select();

        res.json({
            success: true,
            message: '✅ ፓኬጁ ከኪሳራ ነፃ ሆኖ ጸድቋል፤ ለነጋዴው ዋጋው ሊላክ ይችላል!',
            quote: updatedQuote[0]
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sky Way Travel Full System Running on Port ${PORT}`));
