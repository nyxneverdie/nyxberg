'use client';
import {useMemo} from 'react';
import Link from 'next/link';
import {ReactFlow,Background,Controls,type Node,type Edge} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
type GraphNode={path:string;url:string};type GraphEdge={from:string;to:string};
export default function SourceGraph({files,relations}:{files:GraphNode[];relations:GraphEdge[]}){const nodes=useMemo<Node[]>(()=>files.map((f,i)=>({id:f.path,position:{x:(i%4)*235,y:Math.floor(i/4)*105},data:{label:<Link href={f.url}>{f.path}</Link>},style:{background:'#252e22',color:'#e8f2dc',border:'1px solid #899e79',fontSize:12,width:195}})),[files]);const edges=useMemo<Edge[]>(()=>relations.map((r,i)=>({id:`edge-${i}`,source:r.from,target:r.to,animated:false,style:{stroke:'#a9c98d'}})),[relations]);return <div className="source-graph" aria-label="Static dependency graph"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}><Background/><Controls showInteractive={false}/></ReactFlow></div>}
