// Internal tooling only - keep every /admin/* page out of Google (and
// every other crawler that respects robots meta), including the existing
// product-content page which had no such layout until now.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
