import Pre from "@/components/ui/pre"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardGrid } from "@/components/markdown/card"
import { FileTree } from "@/components/markdown/filetree"
import { File, Folder } from "@/components/markdown/filetree/component"
import RoutedLink from "@/components/markdown/link"
import Mermaid from "@/components/markdown/mermaid"
import Note from "@/components/markdown/note"
import { Step, StepItem } from "@/components/markdown/step"
import { Separator } from "@/components/ui/separator"
import ChallengeGhostPlayground from "@/components/learn/ChallengeGhostPlayground"
import BaselineMiniPlayground from "@/components/learn/BaselineMiniPlayground"
import FailureModesShowcase from "@/components/learn/FailureModesShowcase"
import GhostRacePreview from "@/components/learn/GhostRacePreview"
import IntroLoopHero from "@/components/learn/IntroLoopHero"
import GlossaryFrameDiagram from "@/components/learn/GlossaryFrameDiagram"
import NaiveBaselineDemo from "@/components/learn/NaiveBaselineDemo"
import ProblemControlDiagram from "@/components/learn/ProblemControlDiagram"

export const components = {
  a: RoutedLink,
  Card,
  CardGrid,
  FileTree,
  Folder,
  File,
  Mermaid,
  Note,
  Separator,
  pre: Pre,
  Step,
  StepItem,
  BaselineMiniPlayground,
  ChallengeGhostPlayground,
  FailureModesShowcase,
  GlossaryFrameDiagram,
  GhostRacePreview,
  IntroLoopHero,
  NaiveBaselineDemo,
  ProblemControlDiagram,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
}
