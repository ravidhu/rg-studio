import { CpuPenaltyDiagram, MemoryChainDiagram, PoliciesDiagram, SoftHardDiagram, WaterFillingDiagram } from '@/components/diagrams/LimitDiagrams'
import {
  AncestorsDiagram, LeafDiagram, ManagerDiagram, OversubscriptionDiagram, RegexDiagram, RootsDiagram,
  SelectorFlowDiagram, TemplatesDiagram,
} from '@/components/diagrams/StructureDiagrams'
import type { TopicKey } from '@/i18n/en'
import type { ClusterSizing, RgConfig } from '@/types/model'
import type { GroupTree } from '@/utils/tree'

interface ConceptDiagramProps {
  topic: TopicKey
  config: RgConfig
  tree: GroupTree
  sizing: ClusterSizing
}

/** Diagram that shows the mechanism of one concept, when it has one. */
export function ConceptDiagram({ topic, config, tree, sizing }: ConceptDiagramProps) {
  switch (topic) {
    case 'conceptAncestors':
      return (
        <>
          <AncestorsDiagram tree={tree} />
          <OversubscriptionDiagram tree={tree} />
        </>
      )
    case 'conceptSoftHard':
      return <SoftHardDiagram tree={tree} />
    case 'conceptLeaf':
      return <LeafDiagram />
    case 'conceptRoots':
      return <RootsDiagram tree={tree} config={config} sizing={sizing} />
    case 'conceptClusterMemory':
      return <MemoryChainDiagram tree={tree} sizing={sizing} />
    case 'conceptCpu':
      return <CpuPenaltyDiagram tree={tree} config={config} />
    case 'conceptPolicies':
      return <PoliciesDiagram />
    case 'conceptSelectorOrder':
      return <SelectorFlowDiagram config={config} tree={tree} />
    case 'conceptRegex':
      return <RegexDiagram />
    case 'conceptTemplates':
      return <TemplatesDiagram />
    case 'conceptManager':
      return <ManagerDiagram />
    case 'conceptModel':
      return <WaterFillingDiagram />
    default:
      return null
  }
}
