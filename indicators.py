from flask import Flask, request, jsonify
import pandas as pd
import pandas_ta as ta

app = Flask(API)

# Indicator periods
SMA_PERIOD = 3
ADX_PERIOD = 14
RSI_PERIOD_14 = 14
RSI_PERIOD_4 = 4
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
STOCHASTIC_PERIOD = 14
STOCHASTIC_SIGNAL = 3

# PSAR Settings
PSAR_STEP = 0.25
PSAR_MAX = 1

# Store OHLC and indicator data
close_prices = []
high_prices = []
low_prices = []
latest_ohlc = {}
indicator_values = {}

# Store full history of SMA and PSAR
sma_history = []
psar_history = []

# Calculate indicators using pandas-ta
def calculate_indicators():
    if len(close_prices) >= max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD_14, MACD_SLOW, STOCHASTIC_PERIOD):
        df = pd.DataFrame({
            'close': close_prices,
            'high': high_prices,
            'low': low_prices
        })

        sma_values = ta.sma(df['close'], length=SMA_PERIOD)
        psar_values = ta.psar(df['high'], df['low'], step=PSAR_STEP, max=PSAR_MAX)

        sma_history.append(sma_values.iloc[-1] if not sma_values.empty else "N/A")
        psar_history.append(psar_values.iloc[-1] if not psar_values.empty else "N/A")

        if len(sma_history) > 10:
            sma_history.pop(0)
        if len(psar_history) > 10:
            psar_history.pop(0)

        return {
            'SMA': sma_history[-5:],  # Last 5 values
            'PSAR': psar_history[-5:],  # Last 5 values
            'ADX': ta.adx(df['high'], df['low'], df['close'], length=ADX_PERIOD).iloc[-1] if len(close_prices) >= ADX_PERIOD else "N/A",
            'RSI_14': ta.rsi(df['close'], length=RSI_PERIOD_14).iloc[-1] if len(close_prices) >= RSI_PERIOD_14 else "N/A",
            'RSI_4': ta.rsi(df['close'], length=RSI_PERIOD_4).iloc[-1] if len(close_prices) >= RSI_PERIOD_4 else "N/A",
            'MACD': ta.macd(df['close'], fast=MACD_FAST, slow=MACD_SLOW, signal=MACD_SIGNAL).iloc[-1]['MACD'] if len(close_prices) >= MACD_SLOW else "N/A",
            'Stochastic': ta.stoch(df['high'], df['low'], df['close'], k=STOCHASTIC_PERIOD, d=STOCHASTIC_SIGNAL).iloc[-1]['STOCHk'] if len(close_prices) >= STOCHASTIC_PERIOD else "N/A"
        }

@app.route('/')
def home():
    return 'Welcome to the indicators API!'

@app.route('/indicators', methods=['POST'])
def receive_ohlc():
    data = request.get_json()

    if not all(k in data for k in ['open', 'high', 'low', 'close', 'timestamp']):
        return jsonify({'error': 'Missing OHLC data'}), 400

    latest_ohlc.update(data)
    close_prices.append(data['close'])
    high_prices.append(data['high'])
    low_prices.append(data['low'])

    # Keep only necessary history
    max_period = max(SMA_PERIOD, ADX_PERIOD, RSI_PERIOD_14, MACD_SLOW, STOCHASTIC_PERIOD)
    if len(close_prices) > max_period:
        close_prices.pop(0)
        high_prices.pop(0)
        low_prices.pop(0)

    indicator_values.update(calculate_indicators())

    return jsonify({'latestOHLC': latest_ohlc, 'indicatorValues': indicator_values})

@app.route('/indicators', methods=['GET'])
def get_indicators():
    return jsonify({'latestOHLC': latest_ohlc, 'indicatorValues': indicator_values})

if __name__ == '__main__':
    app.run(port=3000, debug=True)
