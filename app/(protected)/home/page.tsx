"use client";

import { Greeting } from "@/components/Greeting";
import { useAppSelector } from "@/lib/redux/hook";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);

  return (
    <div className="w-full">
      <div className="mt-20 grid gap-4">
        <div className="text-center">
          <Greeting name={user?.name ?? ""} />
        </div>
      </div>
    </div>
  );
}
