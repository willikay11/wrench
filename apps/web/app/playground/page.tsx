"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default function Playground() {
  const [dark, setDark] = useState(true);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground p-10 font-sans">
        <div className="mx-auto max-w-3xl space-y-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-medium">Token playground</h1>
              <p className="text-sm text-muted-foreground">
                Edit globals.css and save. This page hot-reloads.
              </p>
            </div>
            <Button variant="outline" onClick={() => setDark(!dark)}>
              {dark ? "Light mode" : "Dark mode"}
            </Button>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              shadcn buttons — these read :root / .dark
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button>default</Button>
              <Button variant="secondary">secondary</Button>
              <Button variant="destructive">destructive</Button>
              <Button variant="outline">outline</Button>
              <Button variant="ghost">ghost</Button>
              <Button variant="link">link</Button>
              <Button isLoading size="lg">loading</Button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Input</h2>
            <div className="max-w-sm space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@company.com" />
              <p className="text-sm text-muted-foreground">
                Border comes from --border. Focus ring comes from --ring.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Card — bg-card, border, --radius-xl
            </h2>
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle>Deployment</CardTitle>
                <CardDescription>
                  Push to main to trigger a build.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Change --radius in globals.css and every corner on this page
                  rescales at once.
                </p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm">Deploy</Button>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </CardFooter>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Surface ramp
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {[
                ["surface-base", "bg-surface-base"],
                ["surface-raised", "bg-surface-raised"],
                ["surface-card", "bg-surface-card"],
                ["surface-card-hover", "bg-surface-card-hover"],
                ["surface-elevated", "bg-surface-elevated"],
              ].map(([name, cls]) => (
                <div key={name} className="space-y-1">
                  <div
                    className={`h-16 rounded-md border border-border-default ${cls}`}
                  />
                  <p className="font-mono text-[11px] text-text-muted">{name}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Text ramp
            </h2>
            <div className="space-y-1">
              <p className="text-text-primary">text-text-primary</p>
              <p className="text-text-secondary">text-text-secondary</p>
              <p className="text-text-muted">text-text-muted</p>
              <p className="text-text-faint">text-text-faint</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}