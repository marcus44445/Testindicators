const express = require('express');
const puppeteer = require('puppeteer');
const { SMA, ADX, Stochastic, RSI, MACD } = require('technicalindicators');

const app = express();
const PORT = 3000;

const BASE_URL = 'https://pocketoption.com/en/cabinet/demo-quick-high-low/';
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
let indicatorValues = {};

// Function to launch browser and navigate to PocketOption
async function loadWebDriver() {
    const browser = await puppeteer.launch({ headless: true }); // Set to true for headless mode
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    console.log(`Navigated to ${BASE_URL}`);
    return { browser, page };
}

// Function to process timestamps into OHLC format
function processTimestampsToOHLC(timestamps) {
    const ohlcData = new Map();

    timestamps.forEach((timestamp) => {
        let interval = new Date(timestamp);
        interval.setSeconds(Math.floor(interval.getSeconds() / 5) * 5, 0);

        const key = interval.getTime();
        if (!ohlcData.has(key)) {
            ohlcData.set(key, { open: timestamp, high: timestamp, low: timestamp, close: timestamp });
        } else {
            let ohlc = ohlcData.get(key);
            ohlc.high = timestamp > ohlc.high ? timestamp : ohlc.high;
            ohlc.low = timestamp < ohlc.low ? timestamp : ohlc.low;
            ohlc.close = timestamp;
        }
    });

    // Add new OHLC values to persistent arrays
    ohlcData.forEach(ohlc => {
        closePrices.push(ohlc.close.getTime());
        highPrices.push(ohlc.high.getTime());
        lowPrices.push(ohlc.low.getTime());
    });

    // Keep only the latest required values
    const maxPeriod = Math.max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD, MACD_SLOW, STOCHASTIC_PERIOD);
    if (closePrices.length > maxPeriod) {
        closePrices = closePrices.slice(-maxPeriod);
        highPrices = highPrices.slice(-maxPeriod);
        lowPrices = lowPrices.slice(-maxPeriod);
    }

    // Calculate indicators when enough data is available
    if (closePrices.length >= maxPeriod) {
        const smaValues = SMA.calculate({ period: SMA_PERIOD, values: closePrices });
        const adxValues = ADX.calculate({ period: ADX_PERIOD, close: closePrices, high: highPrices, low: lowPrices });
        const rsiValues = RSI.calculate({ period: RSI_PERIOD, values: closePrices });
        const macdValues = MACD.calculate({
            values: closePrices,
            fastPeriod: MACD_FAST,
            slowPeriod: MACD_SLOW,
            signalPeriod: MACD_SIGNAL,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        const stochasticValues = Stochastic.calculate({
            period: STOCHASTIC_PERIOD,
            low: lowPrices,
            high: highPrices,
            close: closePrices,
            signalPeriod: STOCHASTIC_SIGNAL
        });

        // Store indicator values in global variable
        indicatorValues = {
            SMA: smaValues,
            ADX: adxValues.length ? adxValues[adxValues.length - 1] : "N/A",
            RSI: rsiValues.length ? rsiValues[rsiValues.length - 1] : "N/A",
            MACD: macdValues.length ? macdValues[macdValues.length - 1] : "N/A",
            Stochastic: stochasticValues.length ? stochasticValues[stochasticValues.length - 1] : "N/A"
        };

        console.log("\nIndicators:", indicatorValues);
    } else {
        console.log("\nWaiting for more data to calculate indicators...");
    }
}

// Function to stream timestamps and process them into OHLC
async function streamTimestamps() {
    const timestamps = [];
    try {
        while (true) {
            const currentTime = new Date();
            timestamps.push(currentTime);

            if (timestamps.length > 0 && currentTime.getSeconds() % 5 === 0) {
                processTimestampsToOHLC(timestamps);
                timestamps.length = 0;
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Sleep 1 second
        }
    } catch (error) {
        console.error("Streaming stopped:", error);
    }
}

// Main execution
(async () => {
    try {
        const { browser, page } = await loadWebDriver();
        await streamTimestamps();
    } catch (error) {
        console.error("Error:", error);
    }
})();

// Define a route to return the indicator values
app.get('/indicators', (req, res) => {
    res.json(indicatorValues);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
