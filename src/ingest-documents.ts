import { processAndStoreDocument } from "./services/rag.service.js";

const APPLE_10K_TEXT = `
UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. 20549 FORM 10-K
ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the fiscal year ended September 27, 2025
Commission File Number: 001-36743
Apple Inc.
One Apple Park Way, Cupertino, California 95014 | Phone: (408) 996-1010
Trading Symbol: AAPL on The Nasdaq Stock Market LLC
Common Stock, $0.00001 par value per share.

Item 1. Business
Company Background: The Company designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories, and sells a variety of related services.
Products:
- iPhone: iPhone 17 Pro, iPhone Air, iPhone 17, iPhone 16 and iPhone 16e.
- Mac: MacBook Air, MacBook Pro, iMac, Mac mini, Mac Studio and Mac Pro.
- iPad: iPad Pro, iPad Air, iPad and iPad mini.
- Wearables, Home and Accessories: Apple Watch Series 11, Apple Watch SE 3, Apple Watch Ultra 3, AirPods Pro 3, Apple Vision Pro, Apple TV 4K, HomePod.
Services: Advertising, AppleCare, Cloud Services, Digital Content (App Store, Apple Music, Apple TV+, Apple Arcade, Apple News+), Payment Services (Apple Pay, Apple Card).

Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations
Segment Operating Performance (in millions):
2025 Net Sales:
- Americas: $178,353 (7% growth)
- Europe: $111,032 (10% growth)
- Greater China: $64,377 (-4% decline)
- Japan: $28,703 (15% growth)
- Rest of Asia Pacific: $33,696 (10% growth)
Total Net Sales: $416,161 million (6% overall growth vs $391,035 million in 2024 and $383,285 million in 2023).

Products and Services Performance (in millions):
- iPhone: $209,586 (4% growth)
- Mac: $33,708 (12% growth)
- iPad: $28,023 (5% growth)
- Wearables, Home & Accessories: $35,686 (-4% decline)
- Services: $109,158 (14% growth)
Total Net Sales: $416,161 million.

Gross Margin:
- Products Gross Margin: $112,887 million (36.8%)
- Services Gross Margin: $82,314 million (75.4%)
Total Gross Margin: $195,201 million (46.9% gross margin percentage vs 46.2% in 2024).

Operating Expenses (in millions):
- Research and Development (R&D): $34,550 million (8% of net sales)
- Selling, General and Administrative (SG&A): $27,601 million (7% of net sales)
Total Operating Expenses: $62,151 million.
Operating Income: $133,050 million vs $123,216 million in 2024.
Net Income: $112,010 million ($7.49 per basic share, $7.46 per diluted share) vs $93,736 million in 2024.

Liquidity and Capital Resources:
Cash, cash equivalents and marketable securities totaled $132.4 billion as of September 27, 2025.
Capital Return Program: Repurchased $89.3 billion of common stock during 2025 and paid dividends of $15.4 billion. Quarterly cash dividend raised to $0.26 per share. New $100 billion share repurchase program authorized in May 2025.
Human Capital: 166,000 full-time equivalent employees as of September 27, 2025.
`;

const NVIDIA_10Q_TEXT = `
UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. 20549 FORM 10-Q
QUARTERLY REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934
For the quarterly period ended April 26, 2026
Commission File Number: 0-23985
NVIDIA CORPORATION
2788 San Tomas Expressway, Santa Clara, California 95051 | Phone: (408) 486-2000
Trading Symbol: NVDA on The Nasdaq Global Select Market
Common Stock, $0.001 par value per share. Outstanding shares: 24.2 billion.

Part I. Financial Information - Condensed Consolidated Statements of Income (in millions, except per share data):
Three Months Ended April 26, 2026 vs April 27, 2025:
- Revenue: $81,615 million vs $44,062 million (85% Year-over-Year growth, 20% Quarter-over-Quarter growth).
- Cost of Revenue: $20,458 million vs $17,394 million.
- Gross Profit: $61,157 million (74.9% gross margin vs 60.5% in prior year).
- Research & Development (R&D) Expense: $6,321 million (58% increase).
- Sales, General & Administrative (SG&A): $1,300 million.
- Total Operating Expenses: $7,621 million.
- Operating Income: $53,536 million (147% Year-over-Year growth vs $21,638 million).
- Total Other Income: $16,367 million.
- Income Tax Expense: $11,582 million (16.6% effective tax rate).
- Net Income: $58,321 million (211% Year-over-Year growth vs $18,775 million).
- Diluted Earnings Per Share (EPS): $2.39 per share vs $0.76 per share (214% growth).

Revenue by Market Platform (in millions):
- Data Center Total Revenue: $75,246 million (92% Year-over-Year growth, 21% Quarter-over-Quarter growth).
  * Hyperscale: $37,869 million (115% YoY growth, 50% of Data Center revenue).
  * AI Clouds, Industrial & Enterprise (ACIE): $37,377 million (74% YoY growth).
- Edge Computing Revenue: $6,369 million (29% YoY growth).
Total Revenue: $81,615 million.

Compute & Networking vs Graphics Segment Performance (in millions):
- Compute & Networking Revenue: $74,550 million (88% growth) | Operating Income: $53,335 million (142% growth). Driven by Blackwell 300 architecture ramp, InfiniBand, Spectrum-X Ethernet, and NVLink solutions.
- Graphics Revenue: $7,065 million (58% growth) | Operating Income: $2,941 million (79% growth). Driven by Blackwell architecture GPUs.

Balance Sheet & Cash Flow Highlights (in millions):
- Cash, Cash Equivalents & Marketable Debt Securities: $50,335 million as of April 26, 2026.
- Operating Cash Flow: $50,344 million for the 3 months ended April 26, 2026 vs $27,414 million in prior year.
- Capital Return Program: Repurchased 108 million shares for $20.2 billion in Q1 FY2027. Board authorized an additional $80.0 billion share repurchase program on May 18, 2026. Quarterly dividend increased to $0.25 per share.
- Product Architecture Roadmap: Blackwell architecture constitutes majority of server shipments. Rubin architecture platform expected to start shipping in second half of fiscal year 2027.
`;

async function main() {
  console.log("🚀 STARTING RAG DOCUMENT INGESTION PROCESS...");

  try {
    // 1. Ingest Apple Inc. Form 10-K
    console.log("📄 Processing Apple Inc. 2025 Form 10-K Report...");
    const appleDoc = await processAndStoreDocument(
      Buffer.from(APPLE_10K_TEXT),
      "Apple_Inc_Form_10K_2025.txt",
      "text/plain"
    );
    console.log(`✅ Apple Document Ingested! ID: ${appleDoc.id}, Chunks: ${appleDoc.chunk_count}`);

    // 2. Ingest NVIDIA Corporation Form 10-Q
    console.log("📄 Processing NVIDIA Corporation 2026 Form 10-Q Report...");
    const nvidiaDoc = await processAndStoreDocument(
      Buffer.from(NVIDIA_10Q_TEXT),
      "NVIDIA_Corp_Form_10Q_2026.txt",
      "text/plain"
    );
    console.log(`✅ NVIDIA Document Ingested! ID: ${nvidiaDoc.id}, Chunks: ${nvidiaDoc.chunk_count}`);

    console.log("🎉 ALL RAG DOCUMENTS INGESTED AND VECTOR INDEXED SUCCESSFULLY!");
  } catch (err: any) {
    console.error("❌ Document Ingestion Error:", err.stack || err.message);
  }
}

main();
