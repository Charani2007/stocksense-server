import { Router, Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

// Mock Stock Data Store for instant lookup & Recharts price timelines
const MOCK_STOCKS: Record<string, any> = {
  AAPL: {
    symbol: "AAPL",
    companyName: "Apple Inc.",
    price: 224.23,
    change: 3.85,
    changePercent: "+1.75%",
    marketCap: "$3.44 Trillion",
    peRatio: 34.2,
    high52: 237.23,
    low52: 164.08,
    history: [
      { date: "Mon", price: 218.4 },
      { date: "Tue", price: 220.1 },
      { date: "Wed", price: 219.5 },
      { date: "Thu", price: 222.8 },
      { date: "Fri", price: 224.23 },
    ],
    swot: {
      strengths: ["Strong ecosystem retention", "High Services margin growth", "$100B+ annual cash flow"],
      weaknesses: ["iPhone hardware saturation", "Regulatory antitrust scrutiny in EU/US"],
      opportunities: ["Apple Intelligence rollout across 2B active devices", "Vision Pro spatial computing"],
      threats: ["Supply chain concentration", "Geopolitical trade friction"],
    },
  },
  NVDA: {
    symbol: "NVDA",
    companyName: "NVIDIA Corporation",
    price: 128.5,
    change: 4.25,
    changePercent: "+3.42%",
    marketCap: "$3.15 Trillion",
    peRatio: 52.8,
    high52: 140.76,
    low52: 39.23,
    history: [
      { date: "Mon", price: 121.2 },
      { date: "Tue", price: 124.0 },
      { date: "Wed", price: 123.5 },
      { date: "Thu", price: 126.8 },
      { date: "Fri", price: 128.5 },
    ],
    swot: {
      strengths: ["Dominant CUDA AI software moat", "Blackwell architecture demand leadership"],
      weaknesses: ["Customer concentration among hyperscalers"],
      opportunities: ["Sovereign AI adoption globally", "Industrial robotics & digital twins"],
      threats: ["Custom ASIC chip development by Big Tech"],
    },
  },
  TSLA: {
    symbol: "TSLA",
    companyName: "Tesla, Inc.",
    price: 219.8,
    change: -1.65,
    changePercent: "-0.75%",
    marketCap: "$701 Billion",
    peRatio: 64.1,
    high52: 271.0,
    low52: 138.8,
    history: [
      { date: "Mon", price: 224.0 },
      { date: "Tue", price: 221.5 },
      { date: "Wed", price: 223.1 },
      { date: "Thu", price: 220.4 },
      { date: "Fri", price: 219.8 },
    ],
    swot: {
      strengths: ["EV manufacturing efficiency", "Full Self-Driving (FSD) fleet data network"],
      weaknesses: ["Automotive gross margin compression"],
      opportunities: ["Robotaxi autonomous network launch", "Megapack energy storage expansion"],
      threats: ["Aggressive EV price competition from China"],
    },
  },
  MSFT: {
    symbol: "MSFT",
    companyName: "Microsoft Corporation",
    price: 448.9,
    change: 4.1,
    changePercent: "+0.92%",
    marketCap: "$3.33 Trillion",
    peRatio: 36.5,
    high52: 468.35,
    low52: 309.45,
    history: [
      { date: "Mon", price: 442.1 },
      { date: "Tue", price: 444.5 },
      { date: "Wed", price: 443.8 },
      { date: "Thu", price: 446.2 },
      { date: "Fri", price: 448.9 },
    ],
    swot: {
      strengths: ["Azure cloud infrastructure dominance", "Copilot AI enterprise integration"],
      weaknesses: ["Heavy OpenAI dependency risk"],
      opportunities: ["Enterprise AI transformation spend"],
      threats: ["Cloud migration headwinds"],
    },
  },
};

/**
 * GET /api/stocks/search?q=:ticker
 */
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const query = ((req.query.q as string) || "AAPL").toUpperCase().trim();

    // If stock exists in cache/mock
    if (MOCK_STOCKS[query]) {
      res.status(200).json({ stock: MOCK_STOCKS[query] });
      return;
    }

    // Try Alpha Vantage API lookup if key provided
    if (ALPHA_VANTAGE_KEY) {
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${query}&apikey=${ALPHA_VANTAGE_KEY}`;
        const avRes = await fetch(url);
        const avData = await avRes.json();
        const quote = avData["Global Quote"];

        if (quote && quote["05. price"]) {
          const price = parseFloat(quote["05. price"]);
          const change = parseFloat(quote["09. change"]);
          const changePercent = quote["10. change percent"];

          const stockData = {
            symbol: query,
            companyName: `${query} Corporation`,
            price,
            change,
            changePercent,
            marketCap: "N/A",
            peRatio: 25.0,
            high52: price * 1.15,
            low52: price * 0.85,
            history: [
              { date: "Mon", price: price * 0.97 },
              { date: "Tue", price: price * 0.98 },
              { date: "Wed", price: price * 0.99 },
              { date: "Thu", price: price * 0.995 },
              { date: "Fri", price: price },
            ],
            swot: {
              strengths: [`Established brand identity in ${query}`],
              weaknesses: ["Macroeconomic volatility"],
              opportunities: ["AI integration & market expansion"],
              threats: ["Competitive market dynamics"],
            },
          };

          res.status(200).json({ stock: stockData });
          return;
        }
      } catch (e) {
        console.warn("Alpha Vantage API fetch error, falling back to default.");
      }
    }

    // Default fallback stock
    res.status(200).json({ stock: MOCK_STOCKS["AAPL"] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
