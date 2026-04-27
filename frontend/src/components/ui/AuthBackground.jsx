import React, { useEffect, useRef } from "react";
import { useTheme } from "../../theme/ThemeProvider.jsx";

const VARIANTS = {
  primary: {
    dark:  { node: "rgba(96, 165, 250, 0.95)",  line: "rgba(59, 130, 246, 0.22)" },
    light: { node: "rgba(147, 197, 253, 1.0)",  line: "rgba(147, 197, 253, 0.30)" },
  },
  secondary: {
    dark:  { node: "rgba(34, 197, 94, 0.88)",  line: "rgba(34, 197, 94, 0.18)" },
    light: { node: "rgba(110, 231, 183, 1.0)", line: "rgba(110, 231, 183, 0.28)" },
  },
};

export default function AuthBackground({ variant = "primary", className = "", children }) {
  const { theme } = useTheme();
  const palette  = VARIANTS[variant] || VARIANTS.primary;
  const colors   = theme === "dark" ? palette.dark : palette.light;

  const canvasRef    = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width  = 1;
    let height = 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width  = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width  = width;
      canvas.height = height;
    };

    resize();

    // Bump node count for a denser, more alive network
    const count              = 130;
    const connectionDistance = 175;
    const nodeSize           = 2.2;
    const mouseRadius        = 130;

    const createNode = () => ({
      x:  Math.random() * width,
      y:  Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * nodeSize + nodeSize * 0.5,
    });

    const nodes = Array.from({ length: count }, createNode);

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const handleMouseLeave = () => { mouseX = -1000; mouseY = -1000; };

    container.addEventListener("mousemove",  handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Parse rgba → glow colour at lower opacity
    const glowColor = (() => {
      const m = /rgba?\(([^)]+)\)/.exec(colors.node);
      if (!m) return colors.node;
      const parts = m[1].split(",").map(p => p.trim());
      if (parts.length < 3) return colors.node;
      const [r, g, b] = parts;
      return `rgba(${r}, ${g}, ${b}, 0.18)`;
    })();

    let animationId;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Update positions + mouse repulsion
      for (const node of nodes) {
        if (mouseRadius > 0) {
          const dx   = node.x - mouseX;
          const dy   = node.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseRadius && dist > 0) {
            const force = ((mouseRadius - dist) / mouseRadius) * 0.025;
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        }

        node.x  += node.vx;
        node.y  += node.vy;
        node.vx *= 0.99;
        node.vy *= 0.99;
        node.vx += (Math.random() - 0.5) * 0.012;
        node.vy += (Math.random() - 0.5) * 0.012;

        if (node.x < 0 || node.x > width)  { node.vx *= -1; node.x = Math.max(0, Math.min(width,  node.x)); }
        if (node.y < 0 || node.y > height) { node.vy *= -1; node.y = Math.max(0, Math.min(height, node.y)); }
      }

      // Draw edges
      ctx.strokeStyle = colors.line;
      ctx.lineWidth   = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[i].x - nodes[j].x;
          const dy   = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            ctx.globalAlpha = (1 - dist / connectionDistance) * 0.55;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      ctx.globalAlpha = 1;
      for (const node of nodes) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.r * 5);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = colors.node;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener("mousemove",  handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      ro.disconnect();
    };
  }, [colors.line, colors.node]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`.trim()}
      style={{
        // Dark mode: near-black. Light mode: deep navy/indigo — clearly different.
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #05050e 0%, #080818 40%, #06101a 70%, #050a10 100%)'
          : 'linear-gradient(135deg, #0f1a3a 0%, #111d4a 40%, #0d1d3d 70%, #091426 100%)',
      }}
    >
      {/* Ambient glow blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-primary-600/12 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-teal-600/6 rounded-full blur-3xl" />
      </div>

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full z-10 pointer-events-none"
      />

      {/* Subtle vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 z-20" />

      <div className="relative z-30">
        {children}
      </div>
    </div>
  );
}
