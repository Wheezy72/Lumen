import React, { useEffect, useRef } from "react";
import { useTheme } from "../../theme/ThemeProvider.jsx";

const VARIANTS = {
  primary: {
    dark: { node: "rgba(59, 130, 246, 0.95)", line: "rgba(59, 130, 246, 0.18)" },
    light: { node: "rgba(37, 99, 235, 0.80)", line: "rgba(37, 99, 235, 0.14)" },
  },
  secondary: {
    dark: { node: "rgba(34, 197, 94, 0.88)", line: "rgba(34, 197, 94, 0.16)" },
    light: { node: "rgba(22, 163, 74, 0.72)", line: "rgba(22, 163, 74, 0.12)" },
  },
};

export default function AuthBackground({ variant = "primary", className = "", children }) {
  const { theme } = useTheme();
  const palette = VARIANTS[variant] || VARIANTS.primary;
  const colors = theme === "dark" ? palette.dark : palette.light;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 1;
    let height = 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
    };

    resize();

    const count = 110;
    const connectionDistance = 165;
    const nodeSize = 2;
    const mouseRadius = 110;

    const createNode = () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * nodeSize + nodeSize * 0.5,
    });

    const nodes = Array.from({ length: count }, createNode);

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const glowColor = (() => {
      const m = /rgba?\(([^)]+)\)/.exec(colors.node);
      if (!m) return colors.node;
      const parts = m[1].split(",").map((p) => p.trim());
      if (parts.length < 3) return colors.node;
      const [r, g, b] = parts;
      return `rgba(${r}, ${g}, ${b}, 0.20)`;
    })();

    let animationId;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (const node of nodes) {
        if (mouseRadius > 0) {
          const dx = node.x - mouseX;
          const dy = node.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseRadius && dist > 0) {
            const force = ((mouseRadius - dist) / mouseRadius) * 0.02;
            node.vx += (dx / dist) * force;
            node.vy += (dy / dist) * force;
          }
        }

        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.99;
        node.vy *= 0.99;

        node.vx += (Math.random() - 0.5) * 0.01;
        node.vy += (Math.random() - 0.5) * 0.01;

        if (node.x < 0 || node.x > width) {
          node.vx *= -1;
          node.x = Math.max(0, Math.min(width, node.x));
        }
        if (node.y < 0 || node.y > height) {
          node.vy *= -1;
          node.y = Math.max(0, Math.min(height, node.y));
        }
      }

      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const opacity = 1 - dist / connectionDistance;
            ctx.globalAlpha = opacity * 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      for (const node of nodes) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.r * 4);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 4, 0, Math.PI * 2);
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
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      ro.disconnect();
    };
  }, [colors.line, colors.node]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`.trim()}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full z-0 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/10 to-white/45 dark:from-black/0 dark:via-black/25 dark:to-black/70 z-10" />
      <div className="relative z-20">{children}</div>
    </div>
  );
}
