"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Filter = ({
  filter,
  setFilter,
}: {
  filter: { keyword: string; room_type?: string; building?: string };
  setFilter: (filter: {
    keyword: string;
    room_type?: string;
    building?: string;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [roomType, setRoomType] = useState(filter.room_type || "all");
  const [building, setBuilding] = useState(filter.building || "all");
  const [isOpen, setIsOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        room_type: roomType && roomType !== "all" ? roomType : undefined,
        building: building && building !== "all" ? building : undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, roomType, building, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setRoomType("all");
    setBuilding("all");
    setFilter({ keyword: "", room_type: undefined, building: undefined });
  };

  const filterCount = [
    keyword,
    roomType && roomType !== "all",
    building && building !== "all",
  ].filter(Boolean).length;

  const roomTypes = [
    { value: "classroom", label: "Classroom" },
    { value: "laboratory", label: "Laboratory" },
    { value: "library", label: "Library" },
    { value: "gym", label: "Gym" },
    { value: "auditorium", label: "Auditorium" },
    { value: "computer_lab", label: "Computer Lab" },
    { value: "science_lab", label: "Science Lab" },
    { value: "music_room", label: "Music Room" },
    { value: "art_room", label: "Art Room" },
    { value: "other", label: "Other" },
  ];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-gray-300 hover:bg-gray-50"
        >
          <FilterIcon className="h-4 w-4" />
          Filter
          {filterCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {filterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Search Rooms
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search by name or building..."
                className="pl-9 pr-9 h-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 w-full"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Room Type
            </label>
            <Select value={roomType} onValueChange={setRoomType}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {roomTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(keyword || roomType !== "all" || building !== "all") && (
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-9 border-gray-300 hover:bg-gray-50"
              >
                <X size={14} className="mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
