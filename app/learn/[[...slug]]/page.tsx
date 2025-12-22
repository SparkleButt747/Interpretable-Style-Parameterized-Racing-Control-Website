import { notFound } from "next/navigation"
import { Link } from "lib/transition"

import { Settings } from "@/types/settings"
import { getDocument } from "@/lib/markdown"
import { PageRoutes } from "@/lib/pageroutes"
import { Separator } from "@/components/ui/separator"
import { Typography } from "@/components/ui/typography"
import { ArticleBreadcrumb } from "@/components/article/breadcrumb"
import { Pagination } from "@/components/article/pagination"
import { TableOfContents } from "@/components/toc"

type PageProps = {
  params: Promise<{ slug: string[] }>
}

export default async function Pages({ params }: PageProps) {
  const { slug = [] } = await params
  const pathName = slug.join("/")
  const res = await getDocument(pathName)

  if (!res) notFound()

  const { frontmatter, content, tocs } = res

  return (
    <div className="flex items-start gap-10">
      <section className="flex-[3]">
        <ArticleBreadcrumb paths={slug} />
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold">{frontmatter.title}</h1>
          <p className="text-sm">{frontmatter.description}</p>
          <Separator />
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Tip: keep the <span className="font-medium text-foreground">Playground</span> open in another tab and try each idea as you read.
          </p>
          <Link
            href="/playground"
            className="inline-flex items-center justify-center rounded-xl border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Open Playground
          </Link>
        </div>
        <Typography>
          <section>{content}</section>
          <Pagination pathname={pathName} />
        </Typography>
      </section>
      <TableOfContents
        tocs={{ tocs }}
        pathName={pathName}
        frontmatter={frontmatter}
      />
    </div>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const { slug = [] } = await params
  const pathName = slug.join("/")
  const res = await getDocument(pathName)

  if (!res) return null

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
      url: `${Settings.metadataBase}/learn/${pathName}`,
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
      canonical: `${Settings.metadataBase}/learn/${pathName}`,
    },
  }
}

export function generateStaticParams() {
  return PageRoutes.filter((item) => item.href).map((item) => ({
    slug: item.href.split("/").slice(1),
  }))
}
