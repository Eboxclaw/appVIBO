import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { buildGraph, type GraphNode } from "@/lib/wiki-links";
import { FileText, Tags, Link2, Layers } from "lucide-react";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isKanban: boolean;
  group?: string;
}

type GroupMode = "none" | "tags" | "links";

// Assign group based on mode
function assignGroups(nodes: SimNode[], edges: { source: string; target: string }[], mode: GroupMode, allNotes: { id: string; tags: string[] }[]) {
  if (mode === "none") {
    nodes.forEach((n) => (n.group = undefined));
    return;
  }
  if (mode === "tags") {
    const noteMap = new Map(allNotes.map((n) => [n.id, n]));
    nodes.forEach((n) => {
      const note = noteMap.get(n.id);
      n.group = note?.tags?.[0] || "untagged";
    });
    return;
  }
  // links: connected component clustering
  const parent = new Map<string, string>();
  nodes.forEach((n) => parent.set(n.id, n.id));
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  edges.forEach((e) => {
    const a = find(e.source), b = find(e.target);
    if (a !== b) parent.set(a, b);
  });
  nodes.forEach((n) => (n.group = find(n.id)));
}

const GROUP_COLORS = [
  "hsl(210,60%,60%)", "hsl(35,65%,55%)", "hsl(150,50%,50%)",
  "hsl(280,50%,60%)", "hsl(10,60%,55%)", "hsl(190,55%,50%)",
  "hsl(60,50%,50%)", "hsl(330,50%,55%)",
];

export function KnowledgeGraph() {
  const { notes, selectNote, setActiveView } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ source: string; target: string }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const dragRef = useRef<{ nodeId: string | null; panning: boolean; lastX: number; lastY: number }>({
    nodeId: null, panning: false, lastX: 0, lastY: 0,
  });

  useEffect(() => {
    const { nodes, edges } = buildGraph(notes);
    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;

    nodesRef.current = nodes.map((n) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * 250,
      y: h / 2 + (Math.random() - 0.5) * 250,
      vx: 0, vy: 0,
    }));
    edgesRef.current = edges;
    assignGroups(nodesRef.current, edges, groupMode, notes);
  }, [notes, groupMode]);

  const screenToWorld = useCallback((sx: number, sy: number) => ({
    x: (sx - offsetRef.current.x) / scaleRef.current,
    y: (sy - offsetRef.current.y) / scaleRef.current,
  }), []);

  const findNodeAt = useCallback((wx: number, wy: number) => {
    for (const node of nodesRef.current) {
      const r = 6 + node.linkCount * 2;
      const dx = node.x - wx, dy = node.y - wy;
      if (dx * dx + dy * dy < r * r) return node;
    }
    return null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();
    window.addEventListener("resize", resize);

    let stable = 0;

    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Repulsion (lighter)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 400 / (dist * dist);
          nodes[i].vx -= (dx / dist) * force;
          nodes[i].vy -= (dy / dist) * force;
          nodes[j].vx += (dx / dist) * force;
          nodes[j].vy += (dy / dist) * force;
        }
      }

      // Spring forces
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.03;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      }

      // Group gravity (if grouped)
      if (groupMode !== "none") {
        const groupCenters = new Map<string, { cx: number; cy: number; count: number }>();
        for (const n of nodes) {
          if (!n.group) continue;
          const g = groupCenters.get(n.group) || { cx: 0, cy: 0, count: 0 };
          g.cx += n.x; g.cy += n.y; g.count++;
          groupCenters.set(n.group, g);
        }
        groupCenters.forEach((g) => { g.cx /= g.count; g.cy /= g.count; });
        for (const n of nodes) {
          if (!n.group) continue;
          const g = groupCenters.get(n.group);
          if (!g) continue;
          n.vx += (g.cx - n.x) * 0.003;
          n.vy += (g.cy - n.y) * 0.003;
        }
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (w / 2 - node.x) * 0.0008;
        node.vy += (h / 2 - node.y) * 0.0008;
      }

      // Apply velocity with higher damping
      let totalV = 0;
      for (const node of nodes) {
        if (dragRef.current.nodeId === node.id) continue;
        node.vx *= 0.8;
        node.vy *= 0.8;
        node.x += node.vx;
        node.y += node.vy;
        totalV += Math.abs(node.vx) + Math.abs(node.vy);
      }

      // Skip rendering if stable
      if (totalV < 0.5 && !dragRef.current.nodeId && !dragRef.current.panning) {
        stable++;
        if (stable > 60) {
          animRef.current = requestAnimationFrame(tick);
          return;
        }
      } else {
        stable = 0;
      }

      // Render
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(offsetRef.current.x, offsetRef.current.y);
      ctx.scale(scaleRef.current, scaleRef.current);

      const isDark = document.documentElement.classList.contains("dark");
      const edgeColor = isDark ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.1)";
      const edgeHighlight = isDark ? "rgba(148,163,184,0.5)" : "rgba(100,116,139,0.4)";
      const textColor = isDark ? "hsl(210,40%,90%)" : "hsl(222,84%,10%)";

      // Group color map
      const groupColorMap = new Map<string, string>();
      if (groupMode !== "none") {
        const groups = [...new Set(nodes.map((n) => n.group).filter(Boolean))];
        groups.forEach((g, i) => groupColorMap.set(g!, GROUP_COLORS[i % GROUP_COLORS.length]));
      }

      // Draw edges
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const isHighlighted = hoveredId === edge.source || hoveredId === edge.target;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isHighlighted ? edgeHighlight : edgeColor;
        ctx.lineWidth = isHighlighted ? 1.5 : 0.8;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const r = 6 + node.linkCount * 2;
        const isHovered = hoveredId === node.id;
        const isConnected = hoveredId && edges.some(
          (e) => (e.source === hoveredId && e.target === node.id) || (e.target === hoveredId && e.source === node.id)
        );

        let fillColor: string;
        if (groupMode !== "none" && node.group) {
          fillColor = groupColorMap.get(node.group) || (isDark ? "hsl(210,40%,70%)" : "hsl(222,47%,25%)");
        } else {
          fillColor = node.isKanban
            ? (isDark ? "hsl(35,70%,60%)" : "hsl(35,60%,40%)")
            : (isDark ? "hsl(210,40%,70%)" : "hsl(222,47%,25%)");
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = (isHovered || isConnected) ? 1 : hoveredId ? 0.3 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        ctx.font = `${isHovered ? "bold " : ""}10px system-ui, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.globalAlpha = (isHovered || isConnected) ? 1 : hoveredId ? 0.3 : 0.7;
        ctx.textAlign = "center";
        ctx.fillText(node.title, node.x, node.y + r + 12);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, [hoveredId, notes, groupMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
      if (node) { node.x = x; node.y = y; node.vx = 0; node.vy = 0; }
      return;
    }
    if (dragRef.current.panning) {
      offsetRef.current.x += e.clientX - dragRef.current.lastX;
      offsetRef.current.y += e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      return;
    }
    const node = findNodeAt(x, y);
    setHoveredId(node?.id || null);
    if (canvasRef.current) canvasRef.current.style.cursor = node ? "pointer" : "grab";
  }, [screenToWorld, findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(x, y);
    if (node) dragRef.current.nodeId = node.id;
    else { dragRef.current.panning = true; dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY; }
  }, [screenToWorld, findNodeAt]);

  const handleMouseUp = useCallback(() => { dragRef.current.nodeId = null; dragRef.current.panning = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(x, y);
    if (node) { selectNote(node.id); setActiveView("notebook"); }
  }, [screenToWorld, findNodeAt, selectNote, setActiveView]);

  const handleZoom = useCallback((direction: "in" | "out") => {
    const delta = direction === "in" ? 1.2 : 0.8;
    const newScale = Math.max(0.2, Math.min(3, scaleRef.current * delta));
    const canvas = canvasRef.current;
    if (canvas) {
      const cx = canvas.width / 2, cy = canvas.height / 2;
      offsetRef.current.x = cx - ((cx - offsetRef.current.x) / scaleRef.current) * newScale;
      offsetRef.current.y = cy - ((cy - offsetRef.current.y) / scaleRef.current) * newScale;
    }
    scaleRef.current = newScale;
  }, []);

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No notes yet</p>
          <p className="text-sm mt-1">Create notes with [[wiki-links]] to see your knowledge graph</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
      {/* Controls: top-right */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button onClick={() => handleZoom("in")} className="h-7 w-7 rounded-md bg-card/80 backdrop-blur border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-bold">+</button>
        <button onClick={() => handleZoom("out")} className="h-7 w-7 rounded-md bg-card/80 backdrop-blur border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-bold">−</button>
      </div>

      {/* Group menu: top-left */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        <div className="bg-card/80 backdrop-blur rounded-lg border border-border p-1 flex flex-col gap-0.5">
          {([
            { mode: "none" as GroupMode, icon: Layers, label: "None" },
            { mode: "tags" as GroupMode, icon: Tags, label: "Tags" },
            { mode: "links" as GroupMode, icon: Link2, label: "Links" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setGroupMode(mode)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                groupMode === mode
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
