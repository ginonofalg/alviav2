import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DotRating } from "./DotRating";
import { RATING_DIMENSIONS, type ReviewRatings, type RatingDimensionKey } from "@shared/schema";

interface RatingSectionProps {
  ratings: ReviewRatings;
  onChange: (key: RatingDimensionKey, value: number) => void;
}

export function RatingSection({ ratings, onChange }: RatingSectionProps) {
  return (
    <Card data-testid="card-rating-section">
      <CardHeader>
        <CardTitle>Rate Your Experience</CardTitle>
        <CardDescription>
          Help us improve by rating different aspects of your interview (optional)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {RATING_DIMENSIONS.map((dim) => (
            <DotRating
              key={dim.key}
              label={dim.label}
              description={dim.description}
              value={ratings[dim.key as RatingDimensionKey]}
              onChange={(value) => onChange(dim.key as RatingDimensionKey, value)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
