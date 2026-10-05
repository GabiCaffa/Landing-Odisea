import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import ModalAdmin from "@/components/admin/ModalAdmin";
import {
  EventCardPreview,
  FormField,
  ImageEditorControls,
  PistaTab,
  TicketsEditor,
  useAceptarConTab,
} from "@/components/admin/CamposEvento";
import {
  useAuth,
  AdminEvent,
  DEFAULT_IMAGE_TRANSFORM,
  ImageTransform,
  NewEventInput,
} from "@/contexts/AuthContext";
import { PaymentAccount } from "@/lib/paymentAccounts";
import { EventTicket, TicketType, saveEventTickets } from "@/lib/ticketTypes";
import { claveDeGrupo, etiquetaDeDia, rangoDeFechas } from "@/lib/grupos";

/**
 * Crear **o editar** una fiesta de varios días, tratándola como una sola cosa.
 *
 * ─── Por qué existe ─────────────────────────────────────────────────────────
 *
 * v26 modeló una fiesta de tres días como tres eventos unidos por un campo, y
 * eso está bien **en la base**: cada día tiene su fecha, sus entradas, su venta
 * y su URL de verdad. Lo que no está bien es obligar a quien carga la fiesta a
 * entender ese modelo: el autor abrió "Nuevo evento", vio "Fiesta de varios
 * días" y escribió ahí el día, dos veces, porque desde el formulario de UN
 * evento no hay forma de adivinar que hay que crear tres.
 *
 * Esta pantalla invierte el orden: se describe **la fiesta** una vez y se
 * agregan **los días**. Por abajo sigue creando N eventos agrupados — el
 * modelo no cambia, cambia quién tiene que saberlo.
 *
 * ─── Editar también, y por el mismo motivo ──────────────────────────────────
 *
 * La primera versión sólo creaba, y el agujero se vio enseguida: el autor
 * cargó los tres días y después quiso sumarles el ABONO. Con la fiesta ya
 * creada eso era editar tres eventos a mano, tildando el mismo tipo y
 * escribiendo el mismo precio tres veces — sin nada que garantice que quedan
 * iguales. **Una pantalla que sólo sirve para crear deja el problema
 * exactamente donde estaba.**
 *
 * En edición, lo compartido (nombre, lugar, flyer, cuenta, Instagram y el
 * abono) se escribe en TODOS los días de una. Lo de cada día —fecha, line-up,
 * sus entradas— sigue siendo de cada día.
 *
 * **No se pueden quitar días desde acá**: borrar un día es borrar un evento, y
 * eso puede tener entregas cargadas (FK `restrict`) y es sólo del admin. Se
 * hace desde la lista, donde el borrado ya avisa lo que corresponde. Agregar
 * días sí.
 *
 * ─── Lo que NO hace, a propósito ────────────────────────────────────────────
 *
 * - **Promos.** Se cargan después, editando cada día. Meterlas acá multiplica
 *   el formulario por N y las promos casi nunca se definen al crear.
 * - **Reposicionar el flyer.** Queda centrado; si hay que ajustarlo se hace
 *   editando el día. Acá el flyer es uno solo para toda la fiesta.
 *
 * ─── El riesgo real: una creación a medias ──────────────────────────────────
 *
 * Son N inserts, no una transacción. Si el tercero falla, los dos primeros ya
 * existen — y dejar a alguien sin saber qué quedó creado es peor que el error
 * en sí. Por eso se crean **en orden**, se corta en el primer fallo y el
 * mensaje dice exactamente cuáles quedaron y qué hacer con ellos.
 */

interface DiaBorrador {
  /** Sólo para React. No viaja a la base. */
  id: string;
  /** El evento que ya existe. Ausente = día nuevo, hay que crearlo. */
  eventId?: string;
  date: string;
  /** Vacío = se arma solo con el nombre de la fiesta y la fecha. */
  nombre: string;
  description: string;
  tickets: EventTicket[];
}

const nuevoDia = (): DiaBorrador => ({
  id: Math.random().toString(36).slice(2),
  date: "",
  nombre: "",
  description: "",
  tickets: [],
});

/** El nombre que se le pone al evento de un día si no escribieron uno. */
const nombreDeDia = (fiesta: string, date: string) => {
  if (!date) return fiesta;
  const { dia, fecha } = etiquetaDeDia(date);
  return `${fiesta} — ${dia} ${fecha}`.trim();
};

const FiestaFormModal = ({
  accounts,
  ticketTypes,
  grupo,
  onClose,
  onSaved,
}: {
  accounts: PaymentAccount[];
  ticketTypes: TicketType[];
  /** Los días de una fiesta que ya existe, ordenados. Ausente = crear una. */
  grupo?: AdminEvent[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { uploadEventImage, createEvent, updateEvent } = useAuth();
  const esEdicion = !!grupo?.length;
  const base = grupo?.[0];
  const fileRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(base?.groupName ?? "");
  const [location, setLocation] = useState(base?.location ?? "");
  const [instagramUrl, setInstagramUrl] = useState(
    base?.instagramUrl ?? "https://www.instagram.com/odisea.uy/"
  );
  const [paymentAccountId, setPaymentAccountId] = useState(
    base?.paymentAccountId ?? accounts.find((a) => a.isDefault)?.id ?? ""
  );
  const [image, setImage] = useState(base?.image ?? "");
  /**
   * El encuadre, COMPARTIDO por los tres días.
   *
   * Si el flyer es uno solo para toda la fiesta, el recorte también tiene que
   * serlo. La primera versión no lo ofrecía y el resultado fue concreto: el
   * autor acomodó a mano el del primer día y los otros dos quedaron centrados
   * — y como la tarjeta de la home usa el flyer del **primer día que todavía
   * venda**, el encuadre iba a saltar solo el día que ese día se agotara.
   *
   * Se toma del primer día al editar: es el que la tarjeta está usando.
   */
  const [imagePosition, setImagePosition] = useState<ImageTransform>(
    () => base?.imagePosition ?? { ...DEFAULT_IMAGE_TRANSFORM }
  );
  const actualizarEncuadre = (updater: (p: ImageTransform) => ImageTransform) =>
    setImagePosition((prev) => updater(prev));
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Dos días de arranque: una fiesta de un solo día se carga con "Nuevo
  // evento", así que acá el mínimo real es dos.
  const [dias, setDias] = useState<DiaBorrador[]>(() =>
    grupo?.length
      ? grupo.map((e) => ({
          id: e.id,
          eventId: e.id,
          date: e.date,
          nombre: e.name,
          description: e.description,
          // Los abonos se manejan arriba, en su sección: si quedaran también
          // acá, se verían dos veces y se podrían editar por dos lados.
          tickets: e.tickets.filter((t) => !t.isAbono),
        }))
      : [nuevoDia(), nuevoDia()]
  );

  /**
   * El ABONO (v28): una entrada que vale para todos los días.
   *
   * Va en su propia sección y NO en la lista de cada día, por dos motivos.
   * Uno: es de la fiesta, no de una fecha, y ponerlo entre las entradas de un
   * día invita a cargarlo tres veces. Dos: si se cargara por día, nada
   * impediría ponerle tres precios distintos al mismo pase.
   *
   * Por abajo termina igual asignado a los tres días —así cada página lo
   * ofrece con su propia relación y el camino de la compra no cambia— pero
   * eso es una decisión del guardado, no algo que haya que cargar a mano.
   */
  const tiposAbono = ticketTypes.filter((t) => t.isAbono && t.active);
  // En edición se busca el abono que ya tenga cualquiera de los días: está en
  // los tres con el mismo precio, así que alcanza con el primero que aparezca.
  const abonoExistente = grupo?.flatMap((e) => e.tickets).find((t) => t.isAbono);
  const [abonoTipoId, setAbonoTipoId] = useState(abonoExistente?.ticketTypeId ?? "");
  const [abonoPrecio, setAbonoPrecio] = useState(
    abonoExistente ? String(abonoExistente.price) : ""
  );

  const cuentasOfrecidas = accounts.filter((a) => a.active || a.id === paymentAccountId);

  const setDia = (id: string, cambio: Partial<DiaBorrador>) =>
    setDias((prev) => prev.map((d) => (d.id === id ? { ...d, ...cambio } : d)));

  const subirFlyer = async (file: File) => {
    setSubiendo(true);
    try {
      const r = await uploadEventImage(file);
      if (!r.ok || !r.url) throw new Error(r.error ?? "No se pudo subir");
      setImage(r.url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Copia las entradas del primer día a los demás. En la práctica los precios
   *  suelen repetirse, y cargar lo mismo tres veces es donde la gente abandona. */
  const copiarEntradas = () => {
    const base = dias[0]?.tickets ?? [];
    if (base.length === 0) {
      toast.error("Cargá primero las entradas del primer día");
      return;
    }
    setDias((prev) =>
      prev.map((d, i) => (i === 0 ? d : { ...d, tickets: base.map((t) => ({ ...t })) }))
    );
    toast.success("Entradas copiadas a todos los días");
  };

  const validar = (): string | null => {
    if (!nombre.trim()) return "Poné el nombre de la fiesta";
    if (!location.trim()) return "Poné el lugar";
    if (!paymentAccountId) return "Elegí la cuenta de cobro";
    if (!image) return "Subí el flyer";
    if (dias.length < 2) return "Una fiesta de varios días necesita al menos dos días";

    for (const [i, d] of dias.entries()) {
      if (!d.date) return `Falta la fecha del día ${i + 1}`;
      if (d.tickets.length === 0) return `El día ${i + 1} no tiene ninguna entrada a la venta`;
    }

    const fechas = dias.map((d) => d.date);
    if (new Set(fechas).size !== fechas.length) return "Hay dos días con la misma fecha";

    if (abonoTipoId && Number(abonoPrecio) <= 0) return "Ponele precio al abono";

    return null;
  };

  const guardar = async () => {
    const error = validar();
    if (error) {
      toast.error(error);
      return;
    }

    setGuardando(true);
    const groupKey = claveDeGrupo(nombre);
    const creados: string[] = [];

    // El abono se le agrega a CADA día, con el mismo precio: es un solo pase,
    // y que cada página lo venda con su propia relación es lo que evita que el
    // modal de compra tenga que ir a buscar entradas de otro evento.
    const tipoAbono = tiposAbono.find((t) => t.id === abonoTipoId);
    const entradasDe = (d: DiaBorrador): EventTicket[] =>
      tipoAbono
        ? [
            ...d.tickets,
            {
              ticketTypeId: tipoAbono.id,
              name: tipoAbono.name,
              description: tipoAbono.description,
              price: Number(abonoPrecio),
              active: true,
              sortOrder: tipoAbono.sortOrder,
              isAbono: true,
            },
          ]
        : d.tickets;

    // En orden y de a uno: si el tercero falla hay que poder decir cuáles
    // quedaron. En paralelo el mensaje de error no podría nombrarlos.
    for (const [i, d] of [...dias].sort((a, b) => a.date.localeCompare(b.date)).entries()) {
      const data: NewEventInput = {
        name: d.nombre.trim() || nombreDeDia(nombre.trim(), d.date),
        date: d.date,
        location: location.trim(),
        description: d.description.trim(),
        price: 0, // lo deriva la DB del tipo más barato (v15)
        capacity: 0,
        status: "activo",
        paymentAccountId,
        tickets: entradasDe(d),
        image,
        // El mismo para los tres: ver el comentario de `imagePosition`.
        imagePosition,
        instagramUrl: instagramUrl.trim(),
        groupKey,
        groupName: nombre.trim(),
      };

      // Día que ya existe → update. Día nuevo → create. Así la misma pantalla
      // sirve para las dos cosas sin que haya que elegir antes cuál es.
      let eventId = d.eventId;
      if (eventId) {
        const r = await updateEvent(eventId, data);
        if (!r.ok) {
          setGuardando(false);
          toast.error(
            `Falló al guardar el día ${i + 1}: ${r.error ?? "error desconocido"}` +
              (creados.length ? ` (los ${creados.length} anteriores sí se guardaron)` : "")
          );
          onSaved();
          return;
        }
      } else {
        const r = await createEvent(data);
        if (!r.ok || !r.id) {
          setGuardando(false);
          toast.error(
            creados.length === 0
              ? `No se pudo crear el día ${i + 1}: ${r.error ?? "error desconocido"}`
              : `Se guardaron ${creados.length} día(s) y falló el ${i + 1}: ${
                  r.error ?? "error desconocido"
                }. Los que quedaron están en la lista de eventos.`
          );
          onSaved();
          return;
        }
        eventId = r.id;
      }

      const t = await saveEventTickets(eventId, entradasDe(d));
      if (!t.ok) {
        setGuardando(false);
        toast.error(
          `El día ${i + 1} se guardó pero sus entradas no: ${
            t.error ?? "error desconocido"
          }. Editalo desde la lista para cargarlas.`
        );
        onSaved();
        return;
      }

      creados.push(eventId);
    }

    setGuardando(false);
    toast.success(
      esEdicion
        ? `Fiesta guardada: ${creados.length} días actualizados.`
        : `Fiesta creada con ${creados.length} días. En la home va a verse como una sola tarjeta.`
    );
    onSaved();
    onClose();
  };

  return (
    <ModalAdmin
      titulo={esEdicion ? "Editar la fiesta" : "Nueva fiesta de varios días"}
      subtitulo={
        esEdicion
          ? "Lo que cambies acá arriba se aplica a todos los días"
          : "Se crea un evento por día, todos juntos bajo la misma fiesta"
      }
      onClose={onClose}
      ancho="3xl"
      pie={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-techno-outline flex-1"
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || subiendo}
            className="btn-techno flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {guardando
              ? "Guardando…"
              : esEdicion
                ? `Guardar los ${dias.length} días`
                : `Crear la fiesta (${dias.length} días)`}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* ─── Lo que es igual para todos los días ───────────────────────── */}
        <section>
          <h3 className="font-sport text-lg font-black tracking-wide text-tinta mb-1">
            LA FIESTA
          </h3>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Esto es lo que comparten todos los días: es lo que se va a ver en la tarjeta de
            la home.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre de la fiesta">
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="input-techno"
                placeholder="EXPO FIESTA OCTUBRE - PAYSANDU"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                El de toda la fiesta, no el de un día.
              </p>
            </FormField>

            <FormField label="Lugar">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input-techno"
                placeholder="Ruta 90 km 6"
              />
            </FormField>

            <FormField label="Cuenta de cobro">
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="input-techno"
              >
                <option value="">Elegí una…</option>
                {cuentasOfrecidas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.bank} · {a.accountNumber}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Instagram (opcional)">
              <input
                type="url"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="input-techno"
              />
            </FormField>
          </div>

          <div className="mt-4">
            <label className="label-techno">Flyer</label>
            {image ? (
              <div className="mt-1 grid gap-4 sm:grid-cols-2">
                {/*
                  La misma vista previa que el formulario de un evento: se
                  arrastra para reencuadrar y la rueda hace zoom. Es
                  importante que sea LA MISMA y no una copia — dos editores
                  de encuadre terminan comportándose distinto.

                  Muestra el nombre y el rango de fechas de la FIESTA, que es
                  lo que va a decir la tarjeta de la home.
                */}
                <EventCardPreview
                  image={image}
                  imagePosition={imagePosition}
                  setImagePosition={actualizarEncuadre}
                  name={nombre || "Nombre de la fiesta"}
                  date={
                    dias.some((d) => d.date)
                      ? rangoDeFechas(dias.filter((d) => d.date).map((d) => d.date))
                      : "Fechas de la fiesta"
                  }
                  location={location || "Lugar del evento"}
                  description={dias[0]?.description || "Descripción del primer día..."}
                  status="activo"
                />
                <div className="space-y-3">
                  <ImageEditorControls
                    transform={imagePosition}
                    setTransform={actualizarEncuadre}
                    onChangeImage={() => fileRef.current?.click()}
                    uploading={subiendo}
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    El flyer y su encuadre son los mismos para{" "}
                    <strong>todos los días</strong>: así la tarjeta de la home se ve igual
                    aunque alguno se agote.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={subiendo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void subirFlyer(file);
                    }}
                  />
                </div>
              </div>
            ) : (
              <label className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border rounded-lg py-8 hover:border-tinta/40 transition-colors">
                {subiendo ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <span className="text-sm">{subiendo ? "Subiendo…" : "Subir el flyer"}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendo}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void subirFlyer(f);
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {/* ─── El abono ──────────────────────────────────────────────────── */}
        <section className="border-t border-border pt-6">
          <h3 className="font-sport text-lg font-black tracking-wide text-tinta mb-1">
            ABONO (OPCIONAL)
          </h3>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Una entrada que vale para <strong>todos los días</strong> de la fiesta. Se
            ofrece en la página de cualquiera de los días, con el cartel “Vale para los{" "}
            {dias.length} días”.
          </p>

          {tiposAbono.length === 0 ? (
            <div className="border border-border bg-secondary/40 rounded-lg p-3">
              <p className="text-xs leading-relaxed">
                No hay ningún tipo de entrada marcado como abono. Creá uno en la pestaña{" "}
                <strong>Entradas</strong> —por ejemplo “ABONO”— y tildá la casilla{" "}
                <strong>“Es un abono”</strong>. Después volvé acá.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Tipo de abono">
                <select
                  value={abonoTipoId}
                  onChange={(e) => setAbonoTipoId(e.target.value)}
                  className="input-techno"
                >
                  <option value="">Sin abono</option>
                  {tiposAbono.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Precio del abono">
                <input
                  type="number"
                  min={0}
                  value={abonoPrecio}
                  onChange={(e) => setAbonoPrecio(e.target.value)}
                  disabled={!abonoTipoId}
                  className="input-techno disabled:opacity-50"
                  placeholder="0"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Uno solo para toda la fiesta.
                </p>
              </FormField>
            </div>
          )}
        </section>

        {/* ─── Los días ──────────────────────────────────────────────────── */}
        <section className="border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h3 className="font-sport text-lg font-black tracking-wide text-tinta">
              LOS DÍAS
            </h3>
            {dias.length > 1 && (
              <button
                type="button"
                onClick={copiarEntradas}
                className="text-xs font-semibold text-celeste-deep underline"
              >
                Copiar las entradas del primer día a todos
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Cada día se vende por separado, con sus propias entradas y precios. El cliente
            elige el día dentro de la página de la fiesta.
          </p>

          <div className="space-y-4">
            {dias.map((d, i) => (
              <div key={d.id} className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-sport font-black tracking-wide text-tinta">
                    DÍA {i + 1}
                    {d.date && (
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">
                        {etiquetaDeDia(d.date).dia} {etiquetaDeDia(d.date).fecha}
                      </span>
                    )}
                  </span>
                  {/* Un día que ya existe no se quita desde acá: borrarlo es
                      borrar un evento, que puede tener entregas cargadas y es
                      sólo del admin. Eso se hace desde la lista. */}
                  {!d.eventId && dias.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setDias((prev) => prev.filter((x) => x.id !== d.id))}
                      aria-label={`Quitar el día ${i + 1}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-charrua/40 text-charrua hover:bg-charrua/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Fecha">
                    <input
                      type="date"
                      value={d.date}
                      onChange={(e) => setDia(d.id, { date: e.target.value })}
                      className="input-techno"
                    />
                  </FormField>

                  <CampoNombreDia
                    value={d.nombre}
                    sugerencia={nombreDeDia(nombre || "La fiesta", d.date)}
                    onChange={(v) => setDia(d.id, { nombre: v })}
                  />
                </div>

                <div className="mt-3">
                  <label className="label-techno">Line-up / descripción de esa noche</label>
                  <textarea
                    value={d.description}
                    onChange={(e) => setDia(d.id, { description: e.target.value })}
                    className="input-techno min-h-[60px]"
                    placeholder="Sonido Caracol + DJ Eddy y Facu Sánchez"
                  />
                </div>

                <div className="mt-3">
                  <label className="label-techno">Entradas de este día</label>
                  {/* Sin los abonos: ésos se cargan una vez, arriba. */}
                  <TicketsEditor
                    catalog={ticketTypes.filter((t) => !t.isAbono)}
                    value={d.tickets}
                    onChange={(tickets) => setDia(d.id, { tickets })}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDias((prev) => [...prev, nuevoDia()])}
            className="btn-techno-outline mt-4 w-full py-3 text-xs"
          >
            <Plus className="h-4 w-4" />
            Agregar otro día
          </button>
        </section>
      </div>
    </ModalAdmin>
  );
};

/**
 * El nombre del día, con la sugerencia aceptable con Tab.
 *
 * Es un componente aparte y no JSX suelto adentro del `.map()` por la regla
 * de los hooks: `useAceptarConTab` no puede llamarse dentro de un bucle de
 * render. Es la tercera vez en el proyecto que una regla de hooks empuja a
 * separar un pedazo de formulario.
 */
const CampoNombreDia = ({
  value,
  sugerencia,
  onChange,
}: {
  value: string;
  sugerencia: string;
  onChange: (v: string) => void;
}) => {
  const alTeclear = useAceptarConTab(value, sugerencia, onChange);
  return (
    <FormField label="Nombre del día (opcional)">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={alTeclear}
        className="input-techno"
        placeholder={sugerencia}
      />
      <PistaTab visible={!value.trim() && !!sugerencia.trim()} />
    </FormField>
  );
};

export default FiestaFormModal;
