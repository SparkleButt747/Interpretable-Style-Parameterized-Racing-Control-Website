import { Settings } from "@/types/settings"
import { getStandaloneSection } from "@/lib/markdown"
import { Separator } from "@/components/ui/separator"
import { Typography } from "@/components/ui/typography"
import { VeloxPlayground } from "./VeloxPlayground"
import { loadVeloxBundle } from "./loadVelox"

export default async function PlaygroundPage() {
  const res = await getStandaloneSection("playground")
  const { frontmatter, content } = res
  const bundle = await loadVeloxBundle()

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-12">
      <div className="space-y-4 text-center">
        <p className="text-sm uppercase tracking-widest text-primary">Interactive Playground</p>
        <h1 className="text-4xl font-bold sm:text-5xl">{frontmatter.title}</h1>
        <p className="text-muted-foreground text-base">{frontmatter.description}</p>
        <Separator />
      </div>
      <VeloxPlayground bundle={bundle} />
      <div className="mx-auto w-full max-w-4xl">
        <Typography>
          <div className="text-left">{content}</div>
        </Typography>
      </div>
    </section>
  )
}

export async function generateMetadata() {
  const res = await getStandaloneSection("playground")
  const { frontmatter, lastUpdated } = res

  return {
    title: `${frontmatter.title} - ${Settings.title}`,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    ...(lastUpdated && {
      lastModified: new Date(lastUpdated).toISOString(),
    }),
    openGraph: {
      title: `${frontmatter.title} - ${Settings.openGraph.title}`,
      description: frontmatter.description || Settings.openGraph.description,
      url: `${Settings.metadataBase}/playground`,
      siteName: Settings.openGraph.siteName,
      type: "article",
      images: Settings.openGraph.images.map((image) => ({
        ...image,
        url: `${Settings.metadataBase}${image.url}`,
      })),
    },
    twitter: {
      title: `${frontmatter.title} - ${Settings.twitter.title}`,
      description: frontmatter.description || Settings.twitter.description,
      card: Settings.twitter.card,
      site: Settings.twitter.site,
      images: Settings.twitter.images.map((image) => ({
        ...image,
        url: `${Settings.metadataBase}${image.url}`,
      })),
    },
    alternates: {
      canonical: `${Settings.metadataBase}/playground`,
    },
  }
}
