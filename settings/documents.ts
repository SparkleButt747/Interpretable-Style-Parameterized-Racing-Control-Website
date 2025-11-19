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
    href: "/physics-backbone",
    items: [
      {
        title: "Feasibility Of The Dynamic Bicycle Model",
        href: "/feasibility-of-the-dynamic-bicycle-model",
      },
      {
        title: "Inputs, Outputs & State",
        href: "/inputs-outputs-and-state",
      },
      {
        title: "What This Buys Us",
        href: "/what-this-buys-us",
      }
    ],
  },
  {
    title: "MPCC",
    href: "/mpcc",
    items: [
      {
        title: "The Idea",
        href: "/the-idea",
      },
      {
        title: "Weights/Constraints And What They Mean",
        href: "/weights-and-constraints",
      }
    ],
  },
  {
    title: "How We Measure & Interact",
    href: "/measurement-and-interaction",
    items: [
      {
        title: "Datasets + Tracks",
        href: "/datasets-and-tracks",
      },
      {
        title: "The Playground",
        href: "/the-playground",
      }
    ],
  },
  {
    spacer: true,
  },
  {
    title: "Idea To Implementation",
    href: "/style-parameterized-controller",
    heading: "Style-Parameterized Controller",
  },
  {
    spacer: true,
  },
  {
    title: "Interactive Playground",
    href: "/interactive-playground",
    heading: "Demos & Comparisons",
    items: [
      {
        title: "Style-Param Controller Playground",
        href: "/style-param-controller-playground",
      },
      {
        title: "MPCC-like Controller Playground",
        href: "/mpcc-controller-playground",
      },
      {
        title: "Head-To-Head Replay",
        href: "/head-to-head-replay",
      },
      {
        title: "Metrics",
        href: "/metrics",
      }
    ],
  },
  {
    title: "Test Your Knowledge",
    href: "/quizzes",
    heading: "Quizzes & Exercises",
    items: [
      {
        title: "Basics Quiz 1",
        href: "/basics-quiz-1",
      },
      {
        title: "Predict Quiz 2",
        href: "/predict-quiz-2",
      }
    ],
  },
]
