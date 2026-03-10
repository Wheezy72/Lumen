import React, { useEffect, useRef } from "react";

/**
 * Constellation background inspired by https://www.shadcn.io/background/constellation
 * (adapted for Vite + React, JS)
 */
export function ConstellationBackground({
  className,
  children,
  count = 80,
  connectionDistance = 150,
  nodeColor = "rgba(59, 130, 246, 0.95)", // primary-500
  lineColor = "rgba(59, 130, 246, 0.18)",
  nodeSize = 2,
  mouseRadius = 110,
  glow = true,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
    };

    resize();

    let animationId;
    let mouseX = -1000;
    let mouseY = -1000;

    const createNode = () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * nodeSize + nodeSize * 0.5,
    });

    const nodes = Array.from({ length: count }, createNode);

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

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(container);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Update nodes
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

        // subtle random drift
        node.vx += (Math.random() - 0.5) * 0.01;
        node.vy += (Math.random() - 0.5) * 0.01;

        // bounce edges
        if (node.x < 0 || node.x > width) {
          node.vx *= -1;
          node.x = Math.max(0, Math.min(width, node.x));
        }
        if (node.y < 0 || node.y > height) {
          node.vy *= -1;
          node.y = Math.max(0, Math.min(height, node.y));
        }
      }

      // connections
      ctx.strokeStyle = lineColor;
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

      // nodes
      ctx.globalAlpha = 1;
      for (const node of nodes) {
        if (glow) {
          const gradient = ctx.createRadialGradient(
            node.x,
            node.y,
            0,
            node.x,
            node.y,
            node.radius * 4
          );

          const glowColor = (() => {
            // Convert "rgba(r,g,b,a)" => "rgba(r,g,b,0.25)" (fallback: keep original)
            const m = /rgba?\(([^)]+)\)/.exec(nodeColor);
            if (!m) return nodeColor;
            const parts = m[1].split(",").map((p) => p.trim());
            if (parts.length < 3) return nodeColor;
            const [r, g, b] = parts;
            return `rgba(${r}, ${g}, ${b}, 0.25)`;
          })();

          gradient.addColorStop(0, glowColor);
          gradient.addColorStop(1, "transparent");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
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
  }, [count, connectionDistance, nodeColor, lineColor, nodeSize, mouseRadius, glow]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className || ""}`.trim()}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Subtle radial overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.14),transparent_55%),radial-gradient(ellipse_at_top,rgba(34,197,94,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.18),transparent_55%),radial-gradient(ellipse_at_top,rgba(34,197,94,0.14),transparent_60%)]" />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/10 to-white/45 dark:from-black/0 dark:via-black/25 dark:to-black/70" />

      <div className="relative">{children}</div>
    </div>
  );
}
