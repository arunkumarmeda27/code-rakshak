# AI Bug Bounty Hunter - Backend

Backend API that scrapes websites, analyzes them with AI, and generates professional PDF bug reports.

## Features

- **Website Scraping**: Uses Puppeteer to extract page structure and content
- **AI Analysis**: Leverages Google Gemini 2.0 Flash for security and UX analysis
- **PDF Reports**: Generates professional, styled PDF bug reports
- **CORS Enabled**: Ready for frontend integration

## Prerequisites

- Node.js 18+ (ES Modules required)
- Google Gemini API key

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
FRONTEND_URL=http://localhost:5173
```

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env` file

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Test API

```bash
npm test
```

## API Endpoints

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-29T12:00:00.000Z"
}
```

### `GET /`

API info and available endpoints.

### `POST /api/analyze`

Analyze a website and generate a PDF bug report.

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:** PDF file (`application/pdf`)

**Errors:**
- `400` - Invalid or missing URL
- `500` - Analysis failed (scraping, AI, or PDF generation error)

## Project Structure

```
backend/
├── server.js           # Express server and routes
├── services/
│   ├── scraper.js      # Puppeteer website scraper
│   ├── ai.js           # Gemini AI analysis
│   └── pdfGenerator.js # PDF report generation
├── .env                # Environment variables (DO NOT COMMIT)
├── .gitignore          # Git ignore rules
├── package.json        # Dependencies and scripts
└── test_api.js         # API test script
```

## Security Notes

- Never commit `.env` files
- API key is validated at runtime
- Stack traces hidden in production (`NODE_ENV=production`)
- URL validation prevents invalid inputs

## Troubleshooting

### Rate Limit Errors

If you see `429` errors from Gemini API:
- Free tier has request limits
- Wait 1-2 minutes between requests
- Consider upgrading to a paid tier

### Puppeteer Issues

If scraping fails:
- Ensure the URL is publicly accessible
- Some sites block automated browsers
- Check firewall/antivirus settings

## License

ISC
