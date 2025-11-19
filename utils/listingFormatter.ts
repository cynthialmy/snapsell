import type { ListingData } from './api';

export function formatListingText(listing: ListingData): string {
  const segments: string[] = [];
  const trim = (value?: string | null) => (value ? value.trim() : '');

  const title = trim(listing.title);
  if (title) {
    segments.push(title);
  }

  const metadata: string[] = [];
  const brand = trim(listing.brand);
  const price = trim(listing.price);
  const condition = trim(listing.condition);
  const location = trim(listing.location);

  if (brand) {
    metadata.push(`Brand: ${brand}`);
  }
  if (price) {
    metadata.push(`Price: ${price}`);
  }
  if (condition) {
    metadata.push(`Condition: ${condition}`);
  }
  if (location) {
    metadata.push(`Location: ${location}`);
  }
  if (metadata.length) {
    segments.push(metadata.join(' • '));
  }

  const logistics: string[] = [];
  if (listing.pickupAvailable) {
    const notes = trim(listing.pickupNotes);
    logistics.push(notes ? `Pickup available (${notes})` : 'Pickup available');
  }
  if (listing.shippingAvailable) {
    logistics.push('Shipping available');
  }
  if (logistics.length) {
    segments.push(logistics.join(' • '));
  }

  const description = trim(listing.description);
  if (description) {
    segments.push('', description);
  }

  return segments.join('\n').trim();
}
