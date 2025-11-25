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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
}
