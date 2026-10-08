"use client";

import { useRef } from "react";
import {
  alignVenueFields,
  type VenueAlignable,
  type VenueAlignField,
} from "@/lib/venues/registry";

/** 本会话里用户手改过的规格字段。刊名再变时不覆盖这些字段。 */
export function useVenueAlign() {
  const touched = useRef(new Set<VenueAlignField>());
  const api = useRef({
    mark(field: VenueAlignField) {
      touched.current.add(field);
    },
    clear() {
      touched.current.clear();
    },
    align<T extends VenueAlignable>(current: T, journal: string): T {
      return alignVenueFields(current, journal, touched.current);
    },
  });
  return api.current;
}
