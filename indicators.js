const express = require('express');
const cors = require('cors');
const Indicators = require('technicalindicators');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Indicator periods
const SMA_PERIOD = 3;
const ADX_PERIOD = 14;
const RSI_PERIOD_14 = 14;
const RSI_PERIOD_4 = 4;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const STOCHASTIC_PERIOD = 14;
const STOCHASTIC_SIGNAL = 3;

// PSAR Settings
const PSAR_STEP = 0.25; // Acceleration Factor Step
const PSAR_MAX = 1; // Maximum Acceleration Factor

// Store OHLC and indicator data
let closePrices = [];
let highPrices = [];
let lowPrices = [];
let latestOHLC = {};
let indicatorValues = {};

// Store full history of SMA and PSAR
let smaHistory = [];
let psarHistory = [];

// Function to calculate indicators
function calculateIndicators() {
    if (closePrices.length >= Math.max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD_14, MACD_SLOW, STOCHASTIC_PERIOD)) {
        let smaValues = Indicators.SMA.calculate({ period: SMA_PERIOD, values: closePrices });
        let psarValues = Indicators.PSAR.calculate({
            high: highPrices,
            low: lowPrices,
            step: PSAR_STEP, 
            max: PSAR_MAX
        });

        // Save full history
        smaHistory.push(smaValues.slice(-1)[0] || "N/A");
        psarHistory.push(psarValues.slice(-1)[0] || "N/A");

        // Keep only last 10 values to avoid memory overflow
        if (smaHistory.length > 10) smaHistory.shift();
        if (psarHistory.length > 10) psarHistory.shift();

        // Store indicator values
        indicatorValues = {
            SMA: smaHistory.slice(-5), // Show last 5 values
            PSAR: psarHistory.slice(-5), // Show last 5 values
            ADX: Indicators.ADX.calculate({
                high: highPrices,
                low: lowPrices,
                close: closePrices,
                period: ADX_PERIOD
            }).slice(-1)[0]?.adx || "N/A",
            RSI_14: Indicators.RSI.calculate({ period: RSI_PERIOD_14, values: closePrices }).slice(-1)[0] || "N/A",
            RSI_4: Indicators.RSI.calculate({ period: RSI_PERIOD_4, values: closePrices }).slice(-1)[0] || "N/A",
            MACD: Indicators.MACD.calculate({ values: closePrices, fastPeriod: MACD_FAST, slowPeriod: MACD_SLOW, signalPeriod: MACD_SIGNAL }).slice(-1)[0] || "N/A",
            Stochastic: Indicators.Stochastic.calculate({ 
                high: highPrices, 
                low: lowPrices, 
                close: closePrices, 
                period: STOCHASTIC_PERIOD, 
                signalPeriod: STOCHASTIC_SIGNAL 
            }).slice(-1)[0] || "N/A"
        };
    }
}

// Endpoint to receive OHLC data and update indicators
app.post('/indicators', (req, res) => {
    const { open, high, low, close, timestamp } = req.body;

    if (!open || !high || !low || !close || !timestamp) {
        return res.status(400).json({ error: 'Missing OHLC data' });
    }

    latestOHLC = { open, high, low, close, timestamp };

    // Store latest prices
    closePrices.push(close);
    highPrices.push(high);
    lowPrices.push(low);

    // Keep only necessary history
    const maxPeriod = Math.max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD_14, MACD_SLOW, STOCHASTIC_PERIOD);
    if (closePrices.length > maxPeriod) {
        closePrices.shift();
        highPrices.shift();
        lowPrices.shift();
    }

    // Calculate indicators
    calculateIndicators();

    console.log("✅ Updated OHLC and Indicators:", { latestOHLC, indicatorValues });
    res.json({ latestOHLC, indicatorValues });
});

// Endpoint to get the latest OHLC and indicators
app.get('/indicators', (req, res) => {
    res.json({ latestOHLC, indicatorValues });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
