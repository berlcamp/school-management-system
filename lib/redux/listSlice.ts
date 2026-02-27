"use client";

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/**
 * List holds different entity types per page (User, Student, Enrollment, etc.)
 * Using unknown[] to satisfy "no any" rule while accepting any entity shape.
 * Entities are typed at consumption sites (e.g., List components).
 */
const initialState = {
  value: [] as unknown[],
};

export const listSlice = createSlice({
  name: "list",
  initialState,
  reducers: {
    addList: (state, action: PayloadAction<unknown[]>) => {
      state.value = action.payload;
    },
    updateList: (state, action: PayloadAction<unknown>) => {
      const payload = action.payload as { id?: string | number };
      const index = state.value.findIndex(
        (item) => (item as { id?: string | number }).id === payload.id
      );
      if (index !== -1) {
        state.value[index] = {
          ...(state.value[index] as object),
          ...(action.payload as object),
        };
      }
    },
    addItem: (state, action: PayloadAction<unknown>) => {
      state.value.unshift(action.payload);
    },

    deleteItem: (state, action: PayloadAction<unknown>) => {
      const payload = action.payload as { id?: string | number };
      state.value = state.value.filter(
        (item) => (item as { id?: string | number }).id !== payload.id
      );
    },
  },
});

export const { addList, updateList, addItem, deleteItem } = listSlice.actions;

export default listSlice.reducer;
