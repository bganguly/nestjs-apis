type Product = {
  productId: string;
};

type ListResponse = {
  items: Product[];
  nextCursor: string | null;
  count: number;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.baseUrl ?? 'http://localhost:3000';
  const pages = args.pages ?? 5;
  const category = args.category ?? 'electronics';
  const minPrice = args.minPrice ?? 20;
  const maxPrice = args.maxPrice ?? 200;
  const limit = args.limit ?? 10;

  console.log(`Attempting up to ${pages} pages (limit=${limit})...`);

  let cursor: string | null = null;

  for (let page = 1; page <= pages; page += 1) {
    console.log(`Fetching page ${page}...`);

    const params = new URLSearchParams({
      category,
      minPrice: String(minPrice),
      maxPrice: String(maxPrice),
      limit: String(limit),
    });

    if (cursor) {
      params.set('cursor', cursor);
    }

    const response = await fetch(`${baseUrl}/api/products?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as ListResponse;
    console.log(`Got ${payload.items.length} items`);

    if (payload.nextCursor) {
      cursor = payload.nextCursor;
      console.log(`Got cursor: ${cursor}`);
    } else {
      console.log('Got cursor: <none>');
      console.log(`No more pages. Stopped at page ${page} of requested ${pages}.`);
      break;
    }
  }
}

function parseArgs(args: string[]): {
  baseUrl?: string;
  pages?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
} {
  const result: {
    baseUrl?: string;
    pages?: number;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
  } = {};

  for (const arg of args) {
    if (arg.startsWith('--baseUrl=')) {
      result.baseUrl = arg.split('=')[1];
    }
    if (arg.startsWith('--pages=')) {
      result.pages = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--category=')) {
      result.category = arg.split('=')[1];
    }
    if (arg.startsWith('--minPrice=')) {
      result.minPrice = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--maxPrice=')) {
      result.maxPrice = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--limit=')) {
      result.limit = Number(arg.split('=')[1]);
    }
  }

  return result;
}

void main();
