import { Paths } from "@/lib/pageroutes"

export const Documents: Paths[] = [
  {
    heading: "Introduction",
    title: "What You'll Learn",
    href: "/introduction"
  },
  {
    title: "Setting The Stage",
    href: "/introduction/setting-the-stage",
    items: [
      {
        title: "The Problem Explained",
        href: "/the-problem-explained",
      },
      {
        title: "Assumptions And Scope",
        href: "/assumptions-and-scope",
      }
    ],
  },
  {
    title: "Physics Backbone",
    href: "/basic-setup",
    items: [
      {
        title: "Feasibility Of The Dynamic Bicycle Model",
        href: "/installation",
      },
      {
        title: "Inputs, Outputs & State",
        href: "/setup",
      },
      {
        title: "What This Buys Us",
        href: "/setup",
      }
    ],
  },
  {
    title: "MPCC",
    href: "/basic-setup",
    items: [
      {
        title: "The Idea",
        href: "/installation",
      },
      {
        title: "Weights/Constraints And What They Mean",
        href: "/setup",
      }
    ],
  },
  {
    title: "How We Measure & Interact",
    href: "/basic-setup",
    items: [
      {
        title: "Datasets + Tracks",
        href: "/installation",
      },
      {
        title: "The Playground",
        href: "/setup",
      }
    ],
  },
  {
    spacer: true,
  },
  {
    title: "Idea To Implementation",
    href: "/navigation",
    heading: "Style-Parameterized Controller",
  },
  {
    spacer: true,
  },
  {
    title: "Interactive Playground",
    href: "/markdown",
    heading: "Demos & Comparisons",
    items: [
      {
        title: "Style-Param Controller Playground",
        href: "/cards",
      },
      {
        title: "MPCC-like Controller Playground",
        href: "/diagrams",
      },
      {
        title: "Head-To-Head Replay",
        href: "/filetree",
      },
      {
        title: "Metrics",
        href: "/lists",
      }
    ],
  },
    {
    title: "Test Your Knowledge",
    href: "/markdown",
    heading: "Quizzes & Exercises",
    items: [
      {
        title: "Basics Quiz 1",
        href: "/cards",
      },
      {
        title: "Predict Quiz 2",
        href: "/cards",
      }
    ],
  },
]
