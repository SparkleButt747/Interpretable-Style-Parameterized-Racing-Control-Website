import { PageRoutes } from "@/lib/pageroutes"

type NavigationItem = {
  title: string
  href: string
  external?: boolean
}

export const Navigations: NavigationItem[] = [
  {
    title: "Learn",
    href: `/learn${PageRoutes[0].href}`,
  },
  {
    title: "Playground",
    href: "/playground",
  },
  {
    title: "Appendix",
    href: "/appendix",
  },
]

export const GitHubLink = {
  href: "https://github.com/SparkleButt747",
}
