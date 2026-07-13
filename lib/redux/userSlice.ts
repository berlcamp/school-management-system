// store/userSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "@supabase/supabase-js";

interface ExtendedUser extends User {
  system_user_id?: number;
  name?: string;
  type: string;
  school_id: string | number | null;
  // True when the user has one or more ARAL tutor assignments, independent of
  // their primary `type`. Lets staff/teachers act as tutors with the same login.
  is_tutor?: boolean;
}

interface UserState {
  user: ExtendedUser | null;
}

const initialState: UserState = {
  user: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<ExtendedUser | null>) => {
      state.user = action.payload;
    },
  },
});

export const { setUser } = userSlice.actions;
export default userSlice.reducer;
