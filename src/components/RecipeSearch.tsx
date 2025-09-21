import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface RecipeSearchProps {
  onSearch: (query: string) => void;
  onTagFilter: (tags: string[]) => void;
  availableTags: string[];
  selectedTags: string[];
}

export const RecipeSearch = ({ onSearch, onTagFilter, availableTags, selectedTags }: RecipeSearchProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onTagFilter(newTags);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    onSearch("");
    onTagFilter([]);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10 h-12"
        />
      </div>

      {/* Tag Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Filter by tags</h3>
          {(selectedTags.length > 0 || searchQuery) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear all
            </Button>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTags.includes(tag) ? "default" : "outline"}
              className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Active Filters Summary */}
      {(selectedTags.length > 0 || searchQuery) && (
        <div className="text-sm text-muted-foreground">
          {searchQuery && (
            <span>Searching for "{searchQuery}"</span>
          )}
          {searchQuery && selectedTags.length > 0 && <span> • </span>}
          {selectedTags.length > 0 && (
            <span>Filtered by {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''}</span>
          )}
        </div>
      )}
    </div>
  );
};