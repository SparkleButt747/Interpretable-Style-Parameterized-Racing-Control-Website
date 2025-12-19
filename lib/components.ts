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
import BicycleDiagram from "@/components/learn/BicycleDiagram"
import CurvatureSpeedBand from "@/components/learn/CurvatureSpeedBand"
import FrictionDonutWidget from "@/components/learn/FrictionDonutWidget"
import GhostRacePreview from "@/components/learn/GhostRacePreview"
import GainSchedulingMiniDemo from "@/components/learn/GainSchedulingMiniDemo"
import IntroLoopHero from "@/components/learn/IntroLoopHero"
import GlossaryFrameDiagram from "@/components/learn/GlossaryFrameDiagram"
import NaiveBaselineDemo from "@/components/learn/NaiveBaselineDemo"
import PreviewLookaheadDemo from "@/components/learn/PreviewLookaheadDemo"
import ProblemControlDiagram from "@/components/learn/ProblemControlDiagram"
import SpeedTrackingPlot from "@/components/learn/SpeedTrackingPlot"
import StyleKnobCards from "@/components/learn/StyleKnobCards"
import ApexOffsetDiagram from "@/components/learn/ApexOffsetDiagram"
import RiskSpeedBandWidget from "@/components/learn/RiskSpeedBandWidget"
import SmoothnessParetoPlot from "@/components/learn/SmoothnessParetoPlot"
import PurePursuitDiagram from "@/components/learn/PurePursuitDiagram"
import BaselinePresetsDemo from "@/components/learn/BaselinePresetsDemo"
import QuizCoreConcepts from "@/components/learn/QuizCoreConcepts"
import PredictionQuiz from "@/components/learn/PredictionQuiz"
import StyleDesignExercise from "@/components/learn/StyleDesignExercise"
import PlaygroundLayoutDemo from "@/components/learn/PlaygroundLayoutDemo"
import ControlPanelDemo from "@/components/learn/ControlPanelDemo"
import OverlayToggleGrid from "@/components/learn/OverlayToggleGrid"
import MetricsPanelDemo from "@/components/learn/MetricsPanelDemo"
import { ApexBiasTable, LookaheadVsOscillation, ParetoJerkScatter } from "@/components/learn/ExperimentPlots"

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
  BicycleDiagram,
  FailureModesShowcase,
  GlossaryFrameDiagram,
  GhostRacePreview,
  IntroLoopHero,
  CurvatureSpeedBand,
  FrictionDonutWidget,
  GainSchedulingMiniDemo,
  NaiveBaselineDemo,
  PreviewLookaheadDemo,
  ProblemControlDiagram,
  SpeedTrackingPlot,
  StyleKnobCards,
  ApexOffsetDiagram,
  RiskSpeedBandWidget,
  SmoothnessParetoPlot,
  PurePursuitDiagram,
  BaselinePresetsDemo,
  QuizCoreConcepts,
  PredictionQuiz,
  StyleDesignExercise,
  PlaygroundLayoutDemo,
  ControlPanelDemo,
  OverlayToggleGrid,
  MetricsPanelDemo,
  LookaheadVsOscillation,
  ApexBiasTable,
  ParetoJerkScatter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
}
