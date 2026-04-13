# NestJS Products API + DynamoDB

An idiomatic NestJS REST API for ecommerce-style products, designed to start small and scale to millions of items in DynamoDB.
The item data shape is user-relatable and React-friendly: title, brand, category, price, rating, image URL, description, stock, and tags.


## Quick Run (Smallest Possible)

1. Start clean and install dependencies:

```bash
rm -rf node_modules && \
npm install
```

2. Start infra + API:

```bash
npm run quickstart
```

3. Quick check (in a new terminal):

```bash
curl -s "http://localhost:3000/api/products?limit=5" | jq
```

4. Simplest teardown:

```bash
npm run infra:down
```


## Why This Data Model

- Easy to consume in product grid/detail/filter UI.
- Supports scalable access patterns with DynamoDB GSIs.
- Works with both real imported data and synthetic generated data.

## Tech Stack

- NestJS 11
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- TypeScript
- `class-validator` + `class-transformer`
- Optional synthetic data via `@faker-js/faker`

## DynamoDB Table Design

Single table: `Products` (name configurable)

- PK: `pk`
- SK: `sk`

Item keys:

- `pk = PRODUCT#<productId>`
- `sk = META`

Indexes:

- `GSI1` for category + price queries
	- `gsi1pk = CATEGORY#<slug(category)>`
	- `gsi1sk = PRICE#<zero-padded-cents>#<productId>`
- `GSI2` for brand listing (newest first)
	- `gsi2pk = BRAND#<slug(brand)>`
	- `gsi2sk = CREATED#<iso>#<productId>`
- `GSI3` for global newest products feed
	- `gsi3pk = ALL_PRODUCTS`
	- `gsi3sk = CREATED#<iso>#<productId>`

This avoids full table scans for common list views, which is important at million-item scale.

## Setup

1. Install deps

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Configure `.env`

```env
PORT=3000
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=Products
# Optional for local DynamoDB
# AWS_ENDPOINT=http://localhost:8000
```

If `DYNAMODB_TABLE_NAME` is omitted, the app and scripts default to `Products`.

## Quickstart (Infra Up/Down)

This project includes a simplified lifecycle flow:

- `infra:up`: creates the DynamoDB table and seeds initial data.
- `infra:down`: deletes the DynamoDB table.
- `quickstart`: runs `infra:up`, then starts the API in dev mode.

1. One-command startup (infra + API):

```bash
npm run quickstart
```

This keeps the terminal attached while the API is running.

2. Bring infra up only (default 1000 items):

```bash
npm run infra:up
```

3. Optional custom seed size:

```bash
npm run infra:up -- --count=5000 --batch=25
```

4. Start API in a second terminal:

```bash
npm run start:dev
```

5. Tear infra down when done:

```bash
npm run infra:down
```

Notes:

- For AWS cloud usage, ensure AWS credentials are configured in your environment.
- For local DynamoDB, set `AWS_ENDPOINT` in `.env`.

## Create Table

```bash
npm run create:table
```

## Add Data

### Option A: Synthetic Seed (recommended to start)

```bash
npm run seed:synthetic -- --count=10000 --batch=25
```

Run repeatedly to grow toward larger scales.

### Option B: Import Public CSV Dataset

```bash
npm run import:csv -- --file=./data/products.csv
```

Notes:

- Public datasets from Kaggle are usually easy to start with.
- Amazon-derived datasets can be much larger and realistic.
- Always verify per-dataset license and allowed use.

## Run API

Dev mode:

```bash
npm run start:dev
```

Build + prod mode:

```bash
npm run build
npm run start:prod
```

Base URL: `http://localhost:3000/api`

## API Smoke Tests (curl)

After starting the API, run these from another terminal.

1. List products:

```bash
curl -s "http://localhost:3000/api/products?limit=5" | jq
```

2. Create a product:

```bash
curl -s -X POST "http://localhost:3000/api/products" \
	-H "Content-Type: application/json" \
	-d '{
		"title": "Bluetooth Speaker Mini",
		"brand": "SoundPeak",
		"category": "electronics",
		"subcategory": "audio",
		"price": 49.99,
		"rating": 4.4,
		"ratingCount": 321,
		"imageUrl": "https://images.example.com/speaker-mini.jpg",
		"description": "Portable speaker with USB-C fast charging.",
		"seller": "SoundPeak Store",
		"tags": ["portable", "wireless"]
	}' | jq
```

3. List by category and price:

```bash
curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10" | jq
```

4. Fetch by product ID (replace `<PRODUCT_ID>`):

```bash
curl -s "http://localhost:3000/api/products/<PRODUCT_ID>" | jq
```

5. Full manual pagination sequence (page 1, then page 2, then page 3):

Fetch page 1 and print cursor only.

```bash
PAGE1=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10")
CURSOR1=$(echo "$PAGE1" | jq -r '.nextCursor')
echo "CURSOR1=$CURSOR1"
```

Fetch page 2 with cursor from page 1, then print cursor only.

```bash
ENCODED_CURSOR1=$(printf '%s' "$CURSOR1" | jq -sRr @uri)
PAGE2=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10&cursor=$ENCODED_CURSOR1")
CURSOR2=$(echo "$PAGE2" | jq -r '.nextCursor')
echo "CURSOR2=$CURSOR2"
```

Fetch page 3 with cursor from page 2, then print cursor only.

```bash
ENCODED_CURSOR2=$(printf '%s' "$CURSOR2" | jq -sRr @uri)
PAGE3=$(curl -s "http://localhost:3000/api/products?category=electronics&minPrice=20&maxPrice=200&limit=10&cursor=$ENCODED_CURSOR2")
CURSOR3=$(echo "$PAGE3" | jq -r '.nextCursor')
echo "CURSOR3=$CURSOR3"
```

Optional: print item counts only (no full response body):

```bash
echo "PAGE1_COUNT=$(echo "$PAGE1" | jq -r '.count')"
echo "PAGE2_COUNT=$(echo "$PAGE2" | jq -r '.count')"
echo "PAGE3_COUNT=$(echo "$PAGE3" | jq -r '.count')"
```

6. Pagination utility (auto-walk up to 5 pages):

```bash
npm run demo:pagination
```

Example output style:

- `Fetching page 1...`
- `Got cursor: <cursor-value>`
- `Fetching page 2...`
- `Got cursor: <cursor-value>`
- ... up to page 5 or until cursor is empty.

## Endpoints

- `POST /api/products`
- `GET /api/products/:id`
- `GET /api/products?category=electronics&minPrice=100&maxPrice=1200&limit=20&cursor=<token>`
- `GET /api/products?brand=apple&limit=20`
- `GET /api/products?limit=20`

Response for list includes `nextCursor` for pagination.

## Example Create Payload

```json
{
	"title": "Wireless Noise Cancelling Headphones",
	"brand": "SoundPeak",
	"category": "electronics",
	"subcategory": "audio",
	"price": 199.99,
	"rating": 4.6,
	"ratingCount": 1234,
	"imageUrl": "https://images.example.com/headphones.jpg",
	"description": "Premium ANC over-ear headphones with 30h battery.",
	"seller": "SoundPeak Official",
	"tags": ["wireless", "anc", "bestseller"]
}
```

## Scale Guidance

- Start with on-demand billing (`PAY_PER_REQUEST`).
- Keep hot partitions low with good key cardinality.
- Use cursor pagination, avoid large offsets.
- Add GSIs only for real query patterns.
- Ingest in batches and retry unprocessed writes.

## React App Compatibility

The model maps directly to typical UI needs:

- Product grid (title, image, price, rating)
- Category and brand filters
- Price sliders
- Product detail page
- Infinite scroll with `nextCursor`
