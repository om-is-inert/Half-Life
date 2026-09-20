// @ts-nocheck
import React, { useRef, useEffect, memo } from 'react';
import './DotField.css';

const TWO_PI = Math.PI * 2;

export const DotField = memo(({
  dotRadius = 2.0,
  dotSpacing = 14,
  cursorRadius = 500,
  cursorForce = 0.0,
  bulgeOnly = false,
  bulgeStrength = 67,
  glowRadius = 160,
  sparkle = false,
  waveAmplitude = 0,
  gradientFrom = 'rgba(255, 255, 255, 0.35)',
  gradientTo = 'rgba(255, 255, 255, 0.15)',
  glowColor = '#ffffff',
  className = '',
  style = {},
  ...rest
}) => {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const circleRef = useRef(null);
  const pointsRef = useRef([]);
  const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
  const animFrameRef = useRef(null);
  const dimensionsRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const glowOpacityRef = useRef(0);
  const targetOpacityRef = useRef(0);
  const propsRef = useRef({});

  propsRef.current = {
    dotRadius,
    dotSpacing,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    sparkle,
    waveAmplitude,
    gradientFrom,
    gradientTo
  };

  const reinitGridRef = useRef(null);
  const gradientIdRef = useRef(`dot-field-glow-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    const canvas = canvasRef.current;
    const circle = circleRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let resizeTimeout;

    function onResize() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateSize, 100);
    }

    function updateSize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimensionsRef.current = {
        w,
        h,
        offsetX: rect.left + window.scrollX,
        offsetY: rect.top + window.scrollY
      };
      initGrid(w, h);
    }

    function initGrid(w, h) {
      const cur = propsRef.current;
      const spacing = cur.dotRadius + cur.dotSpacing;
      const cols = Math.floor(w / spacing);
      const rows = Math.floor(h / spacing);
      const remX = (w % spacing) / 2;
      const remY = (h % spacing) / 2;
      const total = rows * cols;
      const points = new Array(total);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = remX + c * spacing + spacing / 2;
          const y = remY + r * spacing + spacing / 2;
          points[idx++] = { ax: x, ay: y, sx: x, sy: y, vx: 0, vy: 0, x, y };
        }
      }
      pointsRef.current = points;
    }

    function onMouseMove(e) {
      const dim = dimensionsRef.current;
      mouseRef.current.x = e.pageX - dim.offsetX;
      mouseRef.current.y = e.pageY - dim.offsetY;
    }

    function trackSpeed() {
      const m = mouseRef.current;
      const dx = m.prevX - m.x;
      const dy = m.prevY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      m.speed += (dist - m.speed) * 0.5;
      if (m.speed < 0.001) m.speed = 0;
      m.prevX = m.x;
      m.prevY = m.y;
    }

    const speedInterval = setInterval(trackSpeed, 20);
    let frameCount = 0;

    function render() {
      frameCount++;
      const points = pointsRef.current;
      const mouse = mouseRef.current;
      const { w, h } = dimensionsRef.current;
      const cur = propsRef.current;
      const count = points.length;
      const t = frameCount * 0.02;
      const normSpeed = Math.min(mouse.speed / 5, 1);

      targetOpacityRef.current += (normSpeed - targetOpacityRef.current) * 0.06;
      if (targetOpacityRef.current < 0.001) targetOpacityRef.current = 0;
      const targetOp = targetOpacityRef.current;

      glowOpacityRef.current += (targetOp - glowOpacityRef.current) * 0.08;
      if (circle) {
        circle.setAttribute('cx', mouse.x);
        circle.setAttribute('cy', mouse.y);
        circle.style.opacity = glowOpacityRef.current;
      }

      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, cur.gradientFrom);
      grad.addColorStop(1, cur.gradientTo);
      ctx.fillStyle = grad;

      const rad = cur.cursorRadius;
      const radSq = rad * rad;
      const halfRadius = cur.dotRadius / 2;
      const isBulge = cur.bulgeOnly;

      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const pt = points[i];
        const dx = mouse.x - pt.ax;
        const dy = mouse.y - pt.ay;
        const distSq = dx * dx + dy * dy;

        if (distSq < radSq && targetOp > 0.01) {
          const dist = Math.sqrt(distSq);
          if (isBulge) {
            const factor = 1 - dist / rad;
            const wBulge = factor * factor * cur.bulgeStrength * targetOp;
            const angle = Math.atan2(dy, dx);
            pt.sx += (pt.ax - Math.cos(angle) * wBulge - pt.sx) * 0.15;
            pt.sy += (pt.ay - Math.sin(angle) * wBulge - pt.sy) * 0.15;
          } else {
            const angle = Math.atan2(dy, dx);
            const wForce = (500 / dist) * (mouse.speed * cur.cursorForce);
            pt.vx += Math.cos(angle) * -wForce;
            pt.vy += Math.sin(angle) * -wForce;
          }
        } else if (isBulge) {
          pt.sx += (pt.ax - pt.sx) * 0.1;
          pt.sy += (pt.ay - pt.sy) * 0.1;
        }

        if (!isBulge) {
          pt.vx *= 0.9;
          pt.vy *= 0.9;
          pt.x = pt.ax + pt.vx;
          pt.y = pt.ay + pt.vy;
          pt.sx += (pt.x - pt.sx) * 0.1;
          pt.sy += (pt.y - pt.sy) * 0.1;
        }

        let px = pt.sx;
        let py = pt.sy;

        if (cur.waveAmplitude > 0) {
          py += Math.sin(pt.ax * 0.03 + t) * cur.waveAmplitude;
          px += Math.cos(pt.ay * 0.03 + t * 0.7) * cur.waveAmplitude * 0.5;
        }

        if (cur.sparkle && (((i * 2654435761) ^ (frameCount >> 3)) >>> 0) % 100 < 3) {
          ctx.moveTo(px + halfRadius * 1.8, py);
          ctx.arc(px, py, halfRadius * 1.8, 0, TWO_PI);
        } else {
          ctx.moveTo(px + halfRadius, py);
          ctx.arc(px, py, halfRadius, 0, TWO_PI);
        }
      }
      ctx.fill();
      animFrameRef.current = requestAnimationFrame(render);
    }

    updateSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    animFrameRef.current = requestAnimationFrame(render);

    reinitGridRef.current = () => {
      const { w, h } = dimensionsRef.current;
      if (w > 0 && h > 0) initGrid(w, h);
    };

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      clearInterval(speedInterval);
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  useEffect(() => {
    reinitGridRef.current?.();
  }, [dotRadius, dotSpacing]);

  return (
    <div className={`dot-field-container ${className}`.trim()} style={style} {...rest}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <svg ref={svgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <radialGradient id={gradientIdRef.current}>
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle
          ref={circleRef}
          cx="-9999"
          cy="-9999"
          r={glowRadius}
          fill={`url(#${gradientIdRef.current})`}
          style={{ opacity: 0, willChange: 'opacity' }}
        />
      </svg>
    </div>
  );
});

DotField.displayName = 'DotField';
export default DotField;
