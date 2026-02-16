// store/userSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "@supabase/supabase-js";

interface ExtendedUser extends User {
  system_user_id?: number;
  name?: string;
  type?: string;
  school_id?: string | number | null;
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
