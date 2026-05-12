export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#F7F9FC" }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-gray-100 px-8 py-10">
        <div className="mb-8 text-center">
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "#1A2B4C" }}
          >
            JobScout AI
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
