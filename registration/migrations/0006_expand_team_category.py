from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registration", "0005_team_category"),
    ]

    operations = [
        migrations.AlterField(
            model_name="teamregistration",
            name="category",
            field=models.CharField(
                choices=[
                    ("female", "Female"),
                    ("kids", "Kids"),
                    ("mens", "Men's"),
                    ("veteran", "Veteran"),
                ],
                db_index=True,
                default="mens",
                help_text="Female, Kids, Men's or Veteran — used to group and filter teams.",
                max_length=20,
                verbose_name="Team category",
            ),
        ),
    ]
