import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Sélectionner date et heure",
  className,
  "data-testid": testId,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hours = Array.from({ length: 24 }, (_, i) => 
    i.toString().padStart(2, "0")
  );
  const minutes = ["00", "15", "30", "45"];

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const newDate = new Date(date);
      if (value) {
        newDate.setHours(value.getHours());
        newDate.setMinutes(value.getMinutes());
      } else {
        newDate.setHours(12);
        newDate.setMinutes(0);
      }
      onChange(newDate);
    }
  };

  const handleHourChange = (hour: string) => {
    if (value) {
      const newDate = new Date(value);
      newDate.setHours(parseInt(hour));
      onChange(newDate);
    } else {
      const newDate = new Date();
      newDate.setHours(parseInt(hour));
      newDate.setMinutes(0);
      onChange(newDate);
    }
  };

  const handleMinuteChange = (minute: string) => {
    if (value) {
      const newDate = new Date(value);
      newDate.setMinutes(parseInt(minute));
      onChange(newDate);
    } else {
      const newDate = new Date();
      newDate.setHours(12);
      newDate.setMinutes(parseInt(minute));
      onChange(newDate);
    }
  };

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal h-11"
            data-testid={testId}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? (
              format(value, "PPP 'à' HH:mm", { locale: fr })
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 space-y-3">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleDateSelect}
              disabled={(date) => {
                // Compare only the date part (ignore time) to avoid timezone issues
                const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                
                if (minDate) {
                  const minDateOnly = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
                  if (dateOnly < minDateOnly) return true;
                }
                
                if (maxDate) {
                  const maxDateOnly = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
                  if (dateOnly > maxDateOnly) return true;
                }
                
                return false;
              }}
              initialFocus
              locale={fr}
            />
            {value && (
              <div className="px-3 pb-3 pt-0 border-t">
                <div className="text-sm font-medium mb-2">Heure</div>
                <div className="flex gap-2">
                  <Select
                    value={value.getHours().toString().padStart(2, "0")}
                    onValueChange={handleHourChange}
                  >
                    <SelectTrigger className="flex-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {hours.map((hour) => (
                        <SelectItem key={hour} value={hour}>
                          {hour}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={value.getMinutes().toString().padStart(2, "0")}
                    onValueChange={handleMinuteChange}
                  >
                    <SelectTrigger className="flex-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((minute) => (
                        <SelectItem key={minute} value={minute}>
                          {minute}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
