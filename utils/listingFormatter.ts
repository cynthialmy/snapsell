import type { ListingData } from './api';

export function formatListingText(listing: ListingData): string {
  const segments: string[] = [];

  if (listing.title?.trim()) {
    segments.push(listing.title.trim());
  }

  const metadata: string[] = [];
  if (listing.price?.trim()) {
    metadata.push(`Price: ${listing.price.trim()}`);
  }
  if (listing.condition?.trim()) {
    metadata.push(`Condition: ${listing.condition.trim()}`);
  }
  if (listing.location?.trim()) {
    metadata.push(`Location: ${listing.location.trim()}`);
  }
  if (metadata.length) {
    segments.push(metadata.join(' • '));
  }

  if (listing.description?.trim()) {
    segments.push('', listing.description.trim());
  }

  return segments.join('\n').trim();
}
