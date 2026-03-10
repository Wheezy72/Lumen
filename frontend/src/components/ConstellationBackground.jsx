import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../theme/ThemeContext.jsx';

/**
 * Constellation background (ported from shadcn.io "Constellation" registry item).
 * Canvas-based, interactive nodes + connections with mouse repulsion.
 */
export default function ConstellationBackground({
  className = '',
  /** Convenience density scalar (used if `count` is not provided). */
  density = 1,
  /** Number of nodes (overrides density-based calculation). */
  count,
  /** Maximum distance for connections. */
  connectionDistance = 150,
  /** Node size. */
  nodeSize = 2,
  /** Mouse repulsion radius. */
  mouseRadius = 110,
  /** Enable glow effect. */
  glow = true,
  /** Override colors. */
  nodeColor,
  lineColor,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { theme } = useTheme();

  const colors = useMemo(() => {
    const isDark = theme === 'dark';
    return {
      nodeColor: nodeColor || (isDark ? 'rgba(96, 165, 250, 1)' : 'rgba(37, 99, 235, 1)'),
      lineColor: lineColor || (isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(37, 99, 235, 0.14)'),
    };
  }, [theme, nodeColor, lineColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let animationId;
    let width = 1;
    let height = 1;
    let mouseX = -1000;
    let mouseY = -1000;

    const createNode = (size) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * size + size * 0.5,
    });

    let nodes = [];

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const fallbackCount = Math.max(40, Math.min(160, Math.floor((width * height) / 12000) * density));
      const actualCount = typeof count === 'number' ? count : fallbackCount;
      nodes = Array.from({ length: actualCount }, () => createNode(nodeSize));
    };

    resize();

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    // If the cursor leaves the window, reset the mouse position.
    const handleMouseOut = (e) => {
      if (!e.relatedTarget && !e.toElement) {
        mouseX = -1000;
        mouseY = -1000;
      }
    };

    // We listen on window so the canvas container can remain `pointer-events-none`
    // and not interfere with form interactions.
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseout', handleMouseOut);

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Update nodes
      for (const node of nodes) {
        if (!prefersReducedMotion && mouseRadius > 0) {
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

        // damping
        node.vx *= 0.99;
        node.vy *= 0.99;

        if (!prefersReducedMotion) {
          node.vx += (Math.random() - 0.5) * 0.01;
          node.vy += (Math.random() - 0.5) * 0.01;
        }

        if (node.x < 0 || node.x > width) {
          node.vx *= -1;
          node.x = Math.max(0, Math.min(width, node.x));
        }
        if (node.y < 0 || node.y > height) {
          node.vy *= -1;
          node.y = Math.max(0, Math.min(height, node.y));
        }
      }

      // Connections
      ctx.strokeStyle = colors.lineColor;
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

      // Nodes
      ctx.globalAlpha = 1;
      for (const node of nodes) {
        if (glow) {
          const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 4);
          const glowColor = colors.nodeColor.replace('1)', '0.3)');
          gradient.addColorStop(0, glowColor);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = colors.nodeColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = window.requestAnimationFrame(animate);
    };

    animationId = window.requestAnimationFrame(animate);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseOut);
      ro.disconnect();
    };
  }, [density, count, connectionDistance, nodeSize, mouseRadius, glow, colors]);

  return (
    <div ref={containerRef} className={'pointer-events-none ' + className}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
