/**
 * Efectos de fondo de los temas de fin de año, dibujados en UN canvas.
 *
 * - **Navidad:** copos de nieve con profundidad (lejos chicos y nítidos, cerca
 *   grandes y desenfocados, algunos cristales de seis puntas que giran), viento
 *   que cambia, y luces cálidas desenfocadas (bokeh) flotando detrás.
 * - **Año Nuevo:** un "2027" enorme hecho de lamparitas que se prenden en ola,
 *   fuegos artificiales espaciados y burbujas de champagne.
 *
 * Por qué un canvas y no CSS ni una librería: cientos de partículas con física
 * (viento, gravedad) en CSS son cientos de nodos animados; una librería de
 * partículas suma 30-80 KB. Esto son unos KB y se baja recién después de que
 * la página cargó (ver `EfectosTema`).
 *
 * Las figuras NO se dibujan a mano: cada partícula se pinta una sola vez en un
 * "sprite" (un canvas chico) y después sólo se copia. Es lo que lo hace barato
 * y lo que hace que se vea parejo.
 *
 * Reglas que sostiene, todas aprendidas con Halloween:
 * - va DETRÁS del contenido (el canvas está en `z-index: -1`);
 * - con `prefers-reduced-motion` se dibuja un solo cuadro quieto;
 * - en celular hay menos partículas, y la resolución se topea en 1,5x;
 * - con la pestaña en segundo plano `requestAnimationFrame` se detiene solo.
 */

export type ModoEfectos = "navidad" | "anio-nuevo";

type Sprite = HTMLCanvasElement;

const lienzo = (w: number, h: number): Sprite => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

const al = (min: number, max: number) => min + Math.random() * (max - min);

/** Un punto de luz difuso: copo lejano, chispa, centro de lamparita. */
function spriteSuave(r: number, color: string, centro = 1): Sprite {
  const c = lienzo(r * 2, r * 2);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color.replace("ALFA", String(centro)));
  grad.addColorStop(0.4, color.replace("ALFA", String(centro * 0.55)));
  grad.addColorStop(1, color.replace("ALFA", "0"));
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

/** Cristal de nieve de seis puntas, con ramitas. */
function spriteCristal(tam: number): Sprite {
  const pad = tam * 0.35;
  const c = lienzo(tam + pad * 2, tam + pad * 2);
  const g = c.getContext("2d")!;
  const m = c.width / 2;
  const r = tam / 2;
  g.translate(m, m);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineCap = "round";
  g.lineWidth = Math.max(1, tam / 16);
  g.shadowColor = "rgba(220,240,255,0.9)";
  g.shadowBlur = tam / 6;
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((Math.PI / 3) * i);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -r);
    for (const t of [0.45, 0.7]) {
      const largo = r * (t === 0.45 ? 0.32 : 0.22);
      g.moveTo(0, -r * t);
      g.lineTo(-largo * 0.8, -r * t - largo);
      g.moveTo(0, -r * t);
      g.lineTo(largo * 0.8, -r * t - largo);
    }
    g.stroke();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.12, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.fill();
  return c;
}

/** Luz desenfocada con un borde apenas más marcado, como un bokeh de foto. */
function spriteBokeh(r: number, rgb: string): Sprite {
  const c = lienzo(r * 2, r * 2);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.75, `rgba(${rgb},0.38)`);
  grad.addColorStop(0.9, `rgba(${rgb},0.5)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Burbuja de champagne: borde fino y un reflejo. */
function spriteBurbuja(r: number): Sprite {
  const c = lienzo(r * 2 + 4, r * 2 + 4);
  const g = c.getContext("2d")!;
  const m = c.width / 2;
  g.strokeStyle = "rgba(255,236,190,0.55)";
  g.lineWidth = Math.max(1, r / 6);
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,240,205,0.08)";
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = Math.max(1, r / 5);
  g.beginPath();
  g.arc(m, m, r * 0.62, Math.PI * 1.1, Math.PI * 1.45);
  g.stroke();
  return c;
}

/** Lamparita de marquesina: centro casi blanco y halo dorado. */
function spriteLamparita(r: number): Sprite {
  const c = lienzo(r * 2, r * 2);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,252,235,1)");
  grad.addColorStop(0.18, "rgba(255,226,150,0.95)");
  grad.addColorStop(0.45, "rgba(240,180,70,0.35)");
  grad.addColorStop(1, "rgba(240,170,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

// ─── El motor ───────────────────────────────────────────────────────────────

export function iniciarEfectos(
  canvas: HTMLCanvasElement,
  modo: ModoEfectos,
  { quieto = false }: { quieto?: boolean } = {}
): () => void {
  const g = canvas.getContext("2d");
  if (!g) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0;
  let H = 0;
  let celular = false;
  let escena: Escena | null = null;

  const medir = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    celular = W < 640;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    escena = modo === "navidad" ? escenaNavidad(W, H, celular) : escenaAnioNuevo(W, H, celular);
  };
  medir();

  let raf = 0;
  let antes = performance.now();
  const cuadro = (ahora: number) => {
    // Tope de 50 ms: al volver de otra pestaña no hay un salto gigante.
    const dt = Math.min(50, ahora - antes) / 1000;
    antes = ahora;
    g.clearRect(0, 0, W, H);
    escena?.dibujar(g, dt, ahora);
    raf = requestAnimationFrame(cuadro);
  };

  if (quieto) {
    escena?.dibujar(g, 0, performance.now());
  } else {
    raf = requestAnimationFrame(cuadro);
  }

  // Al girar el teléfono o cambiar el tamaño, se rearma la escena. Con un
  // pequeño retraso: el resize dispara muchas veces seguidas.
  let espera = 0;
  const alCambiar = () => {
    window.clearTimeout(espera);
    espera = window.setTimeout(() => {
      // En celular, la barra de direcciones que aparece y desaparece cambia
      // el alto a cada rato: si sólo cambió un poco el alto, no se rearma.
      if (Math.abs(window.innerWidth - W) < 2 && Math.abs(window.innerHeight - H) < 120) return;
      medir();
      if (quieto) escena?.dibujar(g, 0, performance.now());
    }, 200);
  };
  window.addEventListener("resize", alCambiar);

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(espera);
    window.removeEventListener("resize", alCambiar);
    g.clearRect(0, 0, W, H);
  };
}

interface Escena {
  dibujar: (g: CanvasRenderingContext2D, dt: number, ahora: number) => void;
}

// ─── Navidad ────────────────────────────────────────────────────────────────

interface Copo {
  x: number;
  y: number;
  vy: number;
  vaiven: number;
  fase: number;
  giro: number;
  vgiro: number;
  sprite: Sprite;
  tam: number;
  alfa: number;
  /** Cuánto lo empuja el viento: los cercanos, más. */
  empuje: number;
}

interface Luz {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sprite: Sprite;
  alfa: number;
  fase: number;
}

function escenaNavidad(W: number, H: number, celular: boolean): Escena {
  const suave = spriteSuave(16, "rgba(255,255,255,ALFA)");
  const cristales = [spriteCristal(22), spriteCristal(34), spriteCristal(48)];

  const copos: Copo[] = [];
  const capa = (n: number, cfg: Omit<Copo, "x" | "y" | "fase" | "giro"> & { cristal?: number }) => {
    for (let i = 0; i < n; i++) {
      copos.push({
        ...cfg,
        x: al(0, W),
        y: al(-H, H),
        fase: al(0, Math.PI * 2),
        giro: al(0, Math.PI * 2),
        vy: cfg.vy * al(0.75, 1.25),
        tam: cfg.tam * al(0.8, 1.2),
      });
    }
  };
  const k = celular ? 0.55 : 1;
  // Lejos: muchos, chicos, lentos.
  capa(Math.round(110 * k), { vy: 22, vaiven: 6, vgiro: 0, sprite: suave, tam: 4, alfa: 0.55, empuje: 0.4 });
  // Medio: copos difusos y algunos cristales chicos.
  capa(Math.round(45 * k), { vy: 45, vaiven: 14, vgiro: 0, sprite: suave, tam: 8, alfa: 0.8, empuje: 0.7 });
  capa(Math.round(14 * k), { vy: 40, vaiven: 16, vgiro: 0.6, sprite: cristales[0], tam: 15, alfa: 0.85, empuje: 0.7 });
  // Cerca: pocos, grandes, rápidos y algo transparentes, como fuera de foco.
  capa(Math.round(7 * k), { vy: 85, vaiven: 26, vgiro: 0.4, sprite: cristales[1], tam: 30, alfa: 0.55, empuje: 1 });
  capa(Math.round(4 * k), { vy: 110, vaiven: 34, vgiro: 0.3, sprite: cristales[2], tam: 46, alfa: 0.32, empuje: 1.2 });
  capa(Math.round(6 * k), { vy: 95, vaiven: 30, vgiro: 0, sprite: suave, tam: 26, alfa: 0.35, empuje: 1.1 });

  // Luces cálidas de fondo: rojo, dorado, verde y blanco cálido.
  const colores = ["255,90,80", "255,205,110", "90,210,140", "255,236,200"];
  const luces: Luz[] = Array.from({ length: celular ? 7 : 12 }, (_, i) => {
    const r = al(celular ? 34 : 50, celular ? 80 : 130);
    return {
      x: al(0, W),
      y: al(0, H),
      vx: al(-6, 6),
      vy: al(-4, 4),
      sprite: spriteBokeh(r, colores[i % colores.length]),
      alfa: al(0.18, 0.32),
      fase: al(0, Math.PI * 2),
    };
  });

  return {
    dibujar(g, dt, ahora) {
      const t = ahora / 1000;
      // Luces: flotan despacio y "respiran".
      for (const l of luces) {
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        const r = l.sprite.width / 2;
        if (l.x < -r) l.x = W + r;
        if (l.x > W + r) l.x = -r;
        if (l.y < -r) l.y = H + r;
        if (l.y > H + r) l.y = -r;
        g.globalAlpha = l.alfa * (0.75 + 0.25 * Math.sin(t * 0.6 + l.fase));
        g.drawImage(l.sprite, l.x - r, l.y - r);
      }

      // Viento que cambia: una ráfaga lenta más una más rápida.
      const viento = Math.sin(t / 7) * 22 + Math.sin(t / 2.3) * 8;
      for (const c of copos) {
        c.y += c.vy * dt;
        c.x += (viento * c.empuje + Math.sin(t * 0.9 + c.fase) * c.vaiven) * dt;
        c.giro += c.vgiro * dt;
        if (c.y > H + c.tam) {
          c.y = -c.tam - al(0, 40);
          c.x = al(-40, W + 40);
        }
        if (c.x < -c.tam * 2) c.x = W + c.tam;
        if (c.x > W + c.tam * 2) c.x = -c.tam;
        g.globalAlpha = c.alfa;
        if (c.vgiro) {
          g.save();
          g.translate(c.x, c.y);
          g.rotate(c.giro);
          g.drawImage(c.sprite, -c.tam / 2, -c.tam / 2, c.tam, c.tam);
          g.restore();
        } else {
          g.drawImage(c.sprite, c.x - c.tam / 2, c.y - c.tam / 2, c.tam, c.tam);
        }
      }
      g.globalAlpha = 1;
    },
  };
}

// ─── Año Nuevo ──────────────────────────────────────────────────────────────

interface Burbuja {
  x: number;
  y: number;
  vy: number;
  fase: number;
  vaiven: number;
  sprite: Sprite;
  alfa: number;
}

interface Chispa {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  vida: number;
  total: number;
  sprite: Sprite;
}

interface Cohete {
  x: number;
  y: number;
  hastaY: number;
  vy: number;
}

/**
 * Las lamparitas del "2027": se escribe el texto en un canvas aparte y se
 * toman los puntos del BORDE de cada número, como en un cartel de marquesina.
 */
function lamparitas2027(W: number, H: number, celular: boolean) {
  const ancho = Math.min(W * (celular ? 0.92 : 0.8), 980);
  const tam = ancho / 2.35;
  const c = lienzo(ancho, tam * 1.1);
  const g = c.getContext("2d")!;
  g.font = `900 ${tam}px "Inter Tight", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("2027", c.width / 2, c.height / 2);
  const datos = g.getImageData(0, 0, c.width, c.height).data;
  const lleno = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && datos[(Math.round(y) * c.width + Math.round(x)) * 4 + 3] > 128;

  const paso = Math.max(celular ? 9 : 11, tam / 15);
  const puntos: { x: number; y: number; orden: number }[] = [];
  const x0 = (W - c.width) / 2;
  const y0 = H * 0.42 - c.height / 2;
  for (let y = 0; y < c.height; y += paso) {
    for (let x = 0; x < c.width; x += paso) {
      if (!lleno(x, y)) continue;
      const borde =
        !lleno(x - paso, y) || !lleno(x + paso, y) || !lleno(x, y - paso) || !lleno(x, y + paso);
      if (borde) puntos.push({ x: x0 + x, y: y0 + y, orden: x / paso + y / paso / 3 });
    }
  }
  return { puntos, radio: paso * 1.15 };
}

function escenaAnioNuevo(W: number, H: number, celular: boolean): Escena {
  const { puntos, radio } = lamparitas2027(W, H, celular);
  const lampara = spriteLamparita(radio);
  const fases = puntos.map(() => al(0, Math.PI * 2));

  const burbujas: Burbuja[] = Array.from({ length: celular ? 16 : 28 }, () => {
    const r = al(2, 7);
    return {
      x: al(0, W),
      y: al(0, H),
      vy: al(18, 45) * (r / 5),
      fase: al(0, Math.PI * 2),
      vaiven: al(4, 12),
      sprite: spriteBurbuja(r),
      alfa: al(0.45, 0.85),
    };
  });

  const coloresChispa = [
    spriteSuave(6, "rgba(255,226,150,ALFA)"),
    spriteSuave(6, "rgba(255,250,235,ALFA)"),
    spriteSuave(6, "rgba(244,200,120,ALFA)"),
    spriteSuave(6, "rgba(255,170,150,ALFA)"),
  ];
  const chispas: Chispa[] = [];
  const cohetes: Cohete[] = [];
  let proximo = 1.2;

  const estallar = (x: number, y: number) => {
    const n = celular ? 46 : 70;
    const sprite = coloresChispa[Math.floor(al(0, coloresChispa.length))];
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + al(-0.05, 0.05);
      const v = al(90, 210) * (celular ? 0.8 : 1);
      const total = al(1.1, 1.8);
      chispas.push({ x, y, px: x, py: y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vida: total, total, sprite });
    }
  };

  return {
    dibujar(g, dt, ahora) {
      const t = ahora / 1000;

      // El 2027: una ola que recorre las lamparitas y un titileo propio de cada una.
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        const ola = 0.5 + 0.5 * Math.sin(t * 3 - p.orden * 0.35);
        const brillo = 0.25 + 0.55 * ola + 0.2 * (0.5 + 0.5 * Math.sin(t * 7 + fases[i]));
        g.globalAlpha = 0.36 * brillo;
        g.drawImage(lampara, p.x - radio, p.y - radio);
      }

      // Fuegos: cada tanto sale un cohete y explota arriba.
      if (dt > 0) {
        proximo -= dt;
        if (proximo <= 0) {
          proximo = al(celular ? 2.6 : 1.8, celular ? 5 : 4);
          cohetes.push({ x: al(W * 0.12, W * 0.88), y: H + 10, hastaY: al(H * 0.1, H * 0.38), vy: -al(520, 700) });
        }
      }
      for (let i = cohetes.length - 1; i >= 0; i--) {
        const c = cohetes[i];
        c.y += c.vy * dt;
        g.globalAlpha = 0.9;
        g.drawImage(coloresChispa[1], c.x - 4, c.y - 4, 8, 8);
        if (c.y <= c.hastaY) {
          estallar(c.x, c.y);
          cohetes.splice(i, 1);
        }
      }
      g.lineCap = "round";
      for (let i = chispas.length - 1; i >= 0; i--) {
        const s = chispas[i];
        s.px = s.x;
        s.py = s.y;
        // Frenado por el aire y la gravedad: la explosión se abre y cae.
        const freno = Math.exp(-1.6 * dt);
        s.vx *= freno;
        s.vy = s.vy * freno + 140 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vida -= dt;
        if (s.vida <= 0) {
          chispas.splice(i, 1);
          continue;
        }
        const a = Math.min(1, s.vida / s.total) ** 1.4;
        g.globalAlpha = a;
        g.strokeStyle = "rgba(255,226,160,0.6)";
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(s.px, s.py);
        g.lineTo(s.x, s.y);
        g.stroke();
        g.drawImage(s.sprite, s.x - 5, s.y - 5, 10, 10);
      }
      g.globalCompositeOperation = "source-over";

      // Burbujas que suben con vaivén.
      for (const b of burbujas) {
        b.y -= b.vy * dt;
        if (b.y < -20) {
          b.y = H + 20;
          b.x = al(0, W);
        }
        const x = b.x + Math.sin(t * 1.6 + b.fase) * b.vaiven;
        g.globalAlpha = b.alfa;
        g.drawImage(b.sprite, x - b.sprite.width / 2, b.y - b.sprite.height / 2);
      }
      g.globalAlpha = 1;
    },
  };
}

// ─── Explosión al comprar ───────────────────────────────────────────────────

/**
 * Confeti dorado que sale del punto (x, y) — el botón de compra — y cae.
 * Va en un canvas propio ENCIMA de todo y sin recibir clics, y se borra solo.
 */
export function estallido(x: number, y: number): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const W = window.innerWidth;
  const H = window.innerHeight;
  c.width = W * dpr;
  c.height = H * dpr;
  Object.assign(c.style, {
    position: "fixed",
    inset: "0",
    width: `${W}px`,
    height: `${H}px`,
    pointerEvents: "none",
    zIndex: "70",
  });
  c.setAttribute("aria-hidden", "true");
  document.body.appendChild(c);
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colores = ["#E3B34C", "#F7E3A8", "#FFF6DC", "#B8862B", "#FF7A6B"];
  const piezas = Array.from({ length: W < 640 ? 90 : 140 }, () => {
    const ang = al(-Math.PI * 0.95, -Math.PI * 0.05);
    const v = al(260, 620);
    return {
      x,
      y,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v,
      giro: al(0, Math.PI * 2),
      vgiro: al(-9, 9),
      ancho: al(6, 11),
      alto: al(3, 6),
      color: colores[Math.floor(al(0, colores.length))],
    };
  });

  const inicio = performance.now();
  let antes = inicio;
  const cuadro = (ahora: number) => {
    const dt = Math.min(50, ahora - antes) / 1000;
    antes = ahora;
    const pasado = (ahora - inicio) / 1000;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, pasado - 1.4) / 0.8);
    for (const p of piezas) {
      const freno = Math.exp(-2.2 * dt);
      p.vx *= freno;
      p.vy = p.vy * freno + 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.giro += p.vgiro * dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.giro);
      // El "aleteo" del papelito: se aplana y se abre al girar.
      g.scale(1, Math.cos(p.giro * 1.7));
      g.fillStyle = p.color;
      g.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
      g.restore();
    }
    if (pasado < 2.3) requestAnimationFrame(cuadro);
    else c.remove();
  };
  requestAnimationFrame(cuadro);
}
