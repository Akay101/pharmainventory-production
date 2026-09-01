import React, { useEffect, useRef } from "react";

export default function FluidLinePattern({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animationFrameId;

    let width = 0;
    let height = 0;
    let particles = [];
    let mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };

    const particleCount = 52;

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          radius: Math.random() * 2.2 + 1.4,
          baseAlpha: Math.random() * 0.4 + 0.35,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    };

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener("mousemove", handleMouseMove);
      parent.addEventListener("mouseleave", handleMouseLeave);
    }

    const render = () => {
      // Smooth lerp for liquid cursor tracking
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      const isLight = document.documentElement.classList.contains("light");

      // 1. Subtle Precision Geometric Grid Matrix
      const gridSize = 36;
      ctx.strokeStyle = isLight
        ? "rgba(249, 115, 22, 0.12)"
        : "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = 0; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 2. Interactive Cursor Radial Spotlight Aura
      if (mouse.x > 0 && mouse.y > 0) {
        const glowRadius = 220;
        const radialGrad = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          glowRadius
        );

        if (isLight) {
          radialGrad.addColorStop(0, "rgba(249, 115, 22, 0.22)");
          radialGrad.addColorStop(0.5, "rgba(251, 146, 60, 0.09)");
          radialGrad.addColorStop(1, "rgba(249, 115, 22, 0)");
        } else {
          radialGrad.addColorStop(0, "rgba(249, 115, 22, 0.2)");
          radialGrad.addColorStop(0.5, "rgba(245, 158, 11, 0.07)");
          radialGrad.addColorStop(1, "rgba(249, 115, 22, 0)");
        }

        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Particles Physics & Magnetic Attraction
      const maxConnectDist = 135;
      const mouseInteractDist = 185;

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        // Soft screen bounce
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Magnetic Attraction towards cursor
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouseInteractDist && dist > 0) {
          const force = (1 - dist / mouseInteractDist) * 0.8;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        p.pulse += 0.025;
      });

      // 4. Inter-Particle Network Connection Lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxConnectDist) {
            const alpha = (1 - dist / maxConnectDist) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = isLight
              ? `rgba(234, 88, 12, ${alpha * 1.25})`
              : `rgba(251, 146, 60, ${alpha * 1.1})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }
      }

      // 5. Direct Cursor Connection Web Lines
      if (mouse.x > 0 && mouse.y > 0) {
        particles.forEach((p) => {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouseInteractDist) {
            const alpha = (1 - dist / mouseInteractDist) * 0.7;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = isLight
              ? `rgba(234, 88, 12, ${alpha * 1.2})`
              : `rgba(249, 115, 22, ${alpha * 1.2})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        });
      }

      // 6. Glowing Particle Nodes
      particles.forEach((p) => {
        const pulseAlpha = p.baseAlpha + Math.sin(p.pulse) * 0.18;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = isLight
          ? `rgba(234, 88, 12, ${pulseAlpha * 1.1})`
          : `rgba(249, 115, 22, ${pulseAlpha * 1.2})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = isLight
          ? "rgba(249, 115, 22, 0.4)"
          : "rgba(249, 115, 22, 0.6)";
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (parent) {
        parent.removeEventListener("mousemove", handleMouseMove);
        parent.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
