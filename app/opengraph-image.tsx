import { getReceiptData } from "@/lib/github";
import { receiptOgImage, receiptOgSize } from "@/lib/og";

export const alt = "Git Receipts - your GitHub year, on paper";
export const size = receiptOgSize;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image() {
  return receiptOgImage(await getReceiptData());
}
