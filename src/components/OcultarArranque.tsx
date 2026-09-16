import { useEffect } from "react";

/**
 * Levanta el telón de `#arranque` (ver el `<style>` crítico de `index.html`).
 *
 * **Por qué existe.** El sitio es una SPA: el HTML trae `<div id="root">` vacío
 * y no hay nada que pintar hasta que se ejecutan ~574 KB de JavaScript. En un
 * celular real eso son varios segundos de pantalla vacía. `index.html` pinta
 * mientras tanto la marca sobre el fondo del tema, y este componente la quita.
 *
 * **Por qué el telón vive FUERA de `#root`.** Adentro, React lo borraría de
 * golpe al montar; y como el hero arranca en `opacity 0` y hace un fundido de
 * 700 ms, entre una cosa y la otra quedaba un parpadeo de pantalla vacía.
 * Superpuesto y con su propio fundido, los dos se cruzan.
 *
 * **Por qué un `useEffect` y no un `setTimeout` en `main.tsx`.** `root.render()`
 * de React 18 no es síncrono: agenda el trabajo. Un temporizador puesto justo
 * después no sabe si el DOM ya se escribió. Un efecto, sí — corre después del
 * commit, así que para cuando esto pasa el contenido real YA está en el DOM y
 * los dos fundidos se cruzan en el mismo pintado.
 *
 * **Y por qué NO hay un `requestAnimationFrame` acá.** Fue el primer intento,
 * buscando la garantía de que el navegador llegara a pintar. Se rompía: los
 * `rAF` **no corren en una pestaña en segundo plano**, así que quien abriera el
 * sitio en una pestaña de fondo se encontraba el telón tapando todo al volver,
 * hasta que saltara el seguro de 15s del CSS. Verificado en el build real. El
 * efecto solo alcanza y no tiene ese modo de falla.
 */
const OcultarArranque = () => {
  useEffect(() => {
    const telon = document.getElementById("arranque");
    if (!telon) return;

    let quitar = 0;
    const levantar = () => {
      telon.classList.add("arranque--listo");
      // Se saca del DOM recién cuando terminó el fundido (0.6s en el CSS). Si
      // quedara, es un elemento a pantalla completa por encima de todo: aunque
      // sea invisible y sin eventos, no tiene por qué seguir ahí.
      quitar = window.setTimeout(() => telon.remove(), 700);
    };

    /**
     * No se destapa sobre contenido sin estilos.
     *
     * La hoja de la app se carga sin bloquear el render (`cssNoBloqueante` en
     * `vite.config.ts`): así el telón puede pintarse enseguida en vez de esperar
     * 91 KB de CSS. El precio teórico es que React podría montar antes de que la
     * hoja esté aplicada. En la práctica no pasa —la hoja son 91 KB contra ~574
     * KB de JavaScript— pero "en la práctica no pasa" no es una garantía, y acá
     * la garantía cuesta tres líneas.
     *
     * Mientras no cargó, el `<link>` queda en `media="print"`; su `onload` lo
     * pasa a `all`. El respaldo por tiempo es para que un error de red en el CSS
     * no deje el telón puesto para siempre.
     */
    const hoja = document.getElementById("css-app") as HTMLLinkElement | null;
    if (hoja && hoja.media === "print") {
      const respaldo = window.setTimeout(levantar, 3000);
      hoja.addEventListener(
        "load",
        () => {
          clearTimeout(respaldo);
          levantar();
        },
        { once: true }
      );
      return () => {
        clearTimeout(respaldo);
        clearTimeout(quitar);
      };
    }

    levantar();
    return () => clearTimeout(quitar);
  }, []);

  return null;
};

export default OcultarArranque;
