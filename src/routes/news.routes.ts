import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const MOCK_NEWS = [
  {
    id: "1",
    ticker: "NVDA",
    title: "NVIDIA Announces Next-Gen Blackwell Ultra Chips for Enterprise AI Datacenters",
    source: "Bloomberg Financial",
    url: "https://bloomberg.com/news/nvda-blackwell",
    image_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop",
    published_at: new Date().toISOString(),
    ai_summary: [
      "Blackwell Ultra chips boost inference performance by 4x over Hopper architecture.",
      "Major tech hyperscalers have committed to full 2025 capacity reservation.",
      "Gross margins expected to stay above 73% according to executive forecasts.",
    ],
  },
  {
    id: "2",
    ticker: "AAPL",
    title: "Apple Intelligence Features Rollout Expands to Global European and Asian Markets",
    source: "Reuters",
    url: "https://reuters.com/technology/apple-intelligence",
    image_url: "https://images.unsplash.com/photo-1510519138161-58441d828d1f?w=600&auto=format&fit=crop",
    published_at: new Date().toISOString(),
    ai_summary: [
      "Siri integration with ChatGPT expands to 12 additional languages.",
      "Analysts upgrade Q4 iPhone upgrade cycle expectations by 8%.",
      "Services segment revenue projected to cross $25B in upcoming quarter.",
    ],
  },
  {
    id: "3",
    ticker: "TSLA",
    title: "Tesla Energy Storage Megapack Deployments Surge 150% Year-over-Year",
    source: "Wall Street Journal",
    url: "https://wsj.com/articles/tesla-megapack",
    image_url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop",
    published_at: new Date().toISOString(),
    ai_summary: [
      "Energy storage division achieves record quarterly gross margins.",
      "Lathrop Megafactory ramps production capacity to 40 GWh annually.",
      "Analysts highlight energy storage as fastest-growing profit contributor.",
    ],
  },
];

/**
 * GET /api/news — Fetch market news feed with AI key takeaways
 */
router.get("/news", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: cachedNews } = await supabase
      .from("news_cache")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (cachedNews && cachedNews.length > 0) {
      res.status(200).json({ news: cachedNews });
      return;
    }

    res.status(200).json({ news: MOCK_NEWS });
  } catch (err: any) {
    res.status(200).json({ news: MOCK_NEWS });
  }
});

/**
 * GET /api/watchlist — Fetch user watchlist
 */
router.get("/watchlist", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.user_id as string;

    if (!userId) {
      res.status(200).json({
        watchlist: [
          { ticker: "AAPL", company_name: "Apple Inc.", price: "$224.23", change: "+1.75%" },
          { ticker: "NVDA", company_name: "NVIDIA Corp.", price: "$128.50", change: "+3.42%" },
          { ticker: "TSLA", company_name: "Tesla Inc.", price: "$219.80", change: "-0.75%" },
        ],
      });
      return;
    }

    const { data, error } = await supabase
      .from("user_watchlist")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ watchlist: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/watchlist — Add stock ticker to watchlist
 */
router.post("/watchlist", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, ticker, company_name } = req.body;

    if (!user_id || !ticker) {
      res.status(400).json({ error: "user_id and ticker are required." });
      return;
    }

    const { data, error } = await supabase
      .from("user_watchlist")
      .insert({ user_id, ticker: ticker.toUpperCase(), company_name })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ message: "Stock added to watchlist.", item: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
