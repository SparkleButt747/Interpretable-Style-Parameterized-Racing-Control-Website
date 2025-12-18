import { Paths } from "@/lib/pageroutes"

export const Documents: Paths[] = [
  {
    title: "Introduction",
    href: "/introduction",
    items: [
      {
        title: "Problem",
        href: "/problem",
      },
      {
        title: "Scope & Glossary",
        href: "/scope",
      },
    ],
  },
  {
    title: "Core Mechanics",
    href: "/core",
    noLink: true,
    items: [
      {
        title: "Plant And Limits",
        href: "/plant-and-limits",
      }
    ],
  },
  {
    title: "Controllers",
    href: "/controllers",
    noLink: true,
    items: [
      {
        title: "Preview And Speed",
        href: "/preview-and-speed",
      },
      {
        title: "Style-Parameterized",
        href: "/style-parameterized",
      },
      {
        title: "Baseline As Foil",
        href: "/baseline-foil",
      },
    ],
  },
  {
    title: "Playground",
    href: "/playground",
    items: [
      {
        title: "Experiments",
        href: "/experiments",
      },
    ],
  },
  {
    title: "Assess",
    href: "/quizzes",
    noLink: true,
    items: [
      {
        title: "Quizzes",
        href: "/",
      },
    ],
  },
]
