import type { ProductResponse } from '@monorepo/shared-types';
import { formatPrice } from '@monorepo/shared-utils';

interface ProductCardProps {
  product: ProductResponse;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition">
      <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
      <p className="text-gray-600 text-sm mb-2">{product.description}</p>
      <div className="flex justify-between items-center">
        <span className="text-xl font-bold text-blue-600">{formatPrice(product.price)}</span>
        <span className="text-sm text-gray-500">Stock: {product.stockQuantity}</span>
      </div>
    </div>
  );
}
