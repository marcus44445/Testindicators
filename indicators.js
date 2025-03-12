const express = require('express');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const { SMA, ADX, Stochastic, RSI, MACD } = require('technicalindicators');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const BASE_URL = 'https://pocketoption.com/en/cabinet/demo-quick-high-low/';

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/trading_data', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Define OHLC Schema
const ohlcSchema = new mongoose.Schema({
    timestamp: Date,
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    indicators: Object
});

const OHLC = mongoose.model('OHLC', ohlcSchema);

const SMA_PERIOD = 3;
const ADX_PERIOD = 14;
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const STOCHASTIC_PERIOD = 14;
const STOCHASTIC_SIGNAL = 3;

let closePrices = [];
let highPrices = [];
let lowPrices = [];

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Function to launch browser and navigate to PocketOption
async function loadWebDriver() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    console.log(`Navigated to ${BASE_URL}`);
    return { browser, page };
}

// Process OHLC and calculate indicators
async function processOHLC(ohlcData) {
    closePrices.push(ohlcData.close);
    highPrices.push(ohlcData.high);
    lowPrices.push(ohlcData.low);

    const maxPeriod = Math.max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD, MACD_SLOW, STOCHASTIC_PERIOD);
    if (closePrices.length > maxPeriod) {
        closePrices = closePrices.slice(-maxPeriod);
        highPrices = highPrices.slice(-maxPeriod);
        lowPrices = lowPrices.slice(-maxPeriod);
    }

    if (closePrices.length >= maxPeriod) {
        const indicators = {
            SMA: SMA.calculate({ period: SMA_PERIOD, values: closePrices }),
            ADX: ADX.calculate({ period: ADX_PERIOD, close: closePrices, high: highPrices, low: lowPrices }).slice(-1)[0] || "N/A",
            RSI: RSI.calculate({ period: RSI_PERIOD, values: closePrices }).slice(-1)[0] || "N/A",
            MACD: MACD.calculate({
                values: closePrices,
                fastPeriod: MACD_FAST,
                slowPeriod: MACD_SLOW,
                signalPeriod: MACD_SIGNAL,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            }).slice(-1)[0] || "N/A",
            Stochastic: Stochastic.calculate({
                period: STOCHASTIC_PERIOD,
                low: lowPrices,
                high: highPrices,
                close: closePrices,
                signalPeriod: STOCHASTIC_SIGNAL
            }).slice(-1)[0] || "N/A"
        };

        console.log("\n📊 Indicators:", indicators);

        // Save to MongoDB
        const newOHLC = new OHLC({
            timestamp: new Date(),
            open: ohlcData.open,
            high: ohlcData.high,
            low: ohlcData.low,
            close: ohlcData.close,
            indicators
        });

        await newOHLC.save();
    } else {
        console.log("\n⏳ Waiting for more data to calculate indicators...");
    }
}

// POST route to handle incoming data
app.post('/indicators', async (req, res) => {
    try {
        const ohlcData = req.body;
        console.log('📥 Received OHLC Data:', ohlcData);

        await processOHLC(ohlcData);

        res.status(200).json({ message: 'Data received and processed successfully' });
    } catch (error) {
        console.error('❌ Error processing OHLC data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET route to retrieve latest indicators
app.get('/indicators', async (req, res) => {
    try {
        const latestOHLC = await OHLC.findOne().sort({ timestamp: -1 });

        if (latestOHLC) {
            res.json(latestOHLC.indicators);
        } else {
            res.status(404).json({ message: "No data available" });
        }
    } catch (error) {
        console.error('❌ Error fetching indicators:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Main execution
(async () => {
    try {
        await loadWebDriver();
    } catch (error) {
        console.error("❌ Error:", error);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
