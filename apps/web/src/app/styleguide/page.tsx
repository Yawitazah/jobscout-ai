import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardBody, CardFooter } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";

export default function StyleguidePage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] p-8">
      <div className="max-w-3xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-[#1A2B4C] mb-1">
            JobScout AI — Design System
          </h1>
          <p className="text-[#5A6478]">Development only</p>
        </div>

        {/* Colors */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Colors</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "brand", bg: "#1A2B4C", text: "white" },
              { label: "brand.accent", bg: "#0A66C2", text: "white" },
              { label: "success", bg: "#1F7A4D", text: "white" },
              { label: "warning", bg: "#B07502", text: "white" },
              { label: "danger", bg: "#A52A2A", text: "white" },
              { label: "bg", bg: "#F7F9FC", text: "#1A1A1A" },
              { label: "surface", bg: "#FFFFFF", text: "#1A1A1A" },
              { label: "ink", bg: "#1A1A1A", text: "white" },
              { label: "ink.muted", bg: "#5A6478", text: "white" },
              { label: "border", bg: "#E1E6EE", text: "#1A1A1A" },
            ].map(({ label, bg, text }) => (
              <div
                key={label}
                className="rounded-lg p-3 border border-[#E1E6EE]"
                style={{ backgroundColor: bg, color: text }}
              >
                <p className="text-xs font-mono">{label}</p>
                <p className="text-xs opacity-75">{bg}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">
            Typography
          </h2>
          <Card>
            <CardBody className="space-y-3">
              <p className="text-3xl font-bold text-[#1A1A1A]">Heading 1 — Bold 30px</p>
              <p className="text-2xl font-semibold text-[#1A1A1A]">Heading 2 — Semibold 24px</p>
              <p className="text-xl font-semibold text-[#1A1A1A]">Heading 3 — Semibold 20px</p>
              <p className="text-base text-[#1A1A1A]">Body — Regular 15px (base). Inter variable font.</p>
              <p className="text-sm text-[#5A6478]">Small / muted — 14px, ink-muted</p>
              <p className="text-xs text-[#5A6478]">Caption — 12px</p>
              <p className="font-mono text-sm text-[#1A1A1A]">Monospace — JetBrains Mono</p>
            </CardBody>
          </Card>
        </section>

        {/* Buttons */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Buttons</h2>
          <Card>
            <CardBody className="space-y-6">
              <div>
                <p className="text-xs font-medium text-[#5A6478] mb-3 uppercase tracking-wide">
                  Variants
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="tertiary">Tertiary</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-[#5A6478] mb-3 uppercase tracking-wide">
                  Sizes
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-[#5A6478] mb-3 uppercase tracking-wide">
                  States
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button loading>Loading</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Inputs */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Inputs</h2>
          <Card>
            <CardBody className="space-y-4">
              <Input label="Default" placeholder="Placeholder text" />
              <Input
                label="With helper text"
                placeholder="Enter value"
                helperText="This is helper text."
              />
              <Input
                label="With error"
                placeholder="Enter email"
                defaultValue="bad-email"
                error="Enter a valid email address."
              />
              <Input
                label="Password"
                type="password"
                placeholder="Password"
                helperText="8 or more characters."
              />
            </CardBody>
          </Card>
        </section>

        {/* Cards */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Cards</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <p className="font-semibold text-[#1A1A1A]">Card with header</p>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-[#5A6478]">Card body content.</p>
              </CardBody>
              <CardFooter>
                <div className="flex gap-2">
                  <Button size="sm">Save</Button>
                  <Button size="sm" variant="secondary">
                    Cancel
                  </Button>
                </div>
              </CardFooter>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-[#5A6478]">Card body only.</p>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* Badges */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Badges</h2>
          <Card>
            <CardBody>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="info">Info</Badge>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Spinners */}
        <section>
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Spinners</h2>
          <Card>
            <CardBody>
              <div className="flex items-center gap-6">
                <div className="text-center space-y-1">
                  <Spinner size="sm" />
                  <p className="text-xs text-[#5A6478]">sm (16px)</p>
                </div>
                <div className="text-center space-y-1">
                  <Spinner size="md" />
                  <p className="text-xs text-[#5A6478]">md (24px)</p>
                </div>
                <div className="text-center space-y-1">
                  <Spinner size="lg" />
                  <p className="text-xs text-[#5A6478]">lg (40px)</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
