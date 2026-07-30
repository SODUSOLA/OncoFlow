export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="px-6 py-24 text-center">
      <h1 className="text-3xl font-bold text-gray-800">{title}</h1>
      <p className="mt-3 text-gray-500">Content pending Figma sync.</p>
    </div>
  );
}
