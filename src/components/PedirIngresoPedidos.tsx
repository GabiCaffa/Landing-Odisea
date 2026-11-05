import { Link, useLocation } from "react-router-dom";

/**
 * Los pedidos se ven sólo con la cuenta de quien compró (v44): sin sesión, se
 * pide entrar. Vale también para quien compró SIN cuenta: si se registra con
 * el mismo email del pedido, lo ve (el email ya viene confirmado, así que
 * nadie puede usar el de otro).
 *
 * Después de entrar vuelve a la misma página (`state.from`).
 */
const PedirIngresoPedidos = () => {
  const { pathname } = useLocation();
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="font-semibold">Ingresá para ver tus pedidos</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Por seguridad, cada pedido se ve sólo desde la cuenta de quien lo hizo. Si compraste sin cuenta,
        creá una con el mismo mail que pusiste en el pedido y lo vas a ver acá.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/login" state={{ from: pathname }} className="btn-celeste inline-flex">
          Ingresar
        </Link>
        <Link to="/registro" state={{ from: pathname }} className="btn-techno-outline inline-flex">
          Crear cuenta
        </Link>
      </div>
    </div>
  );
};

export default PedirIngresoPedidos;
